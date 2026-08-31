import { distanceMeters, walkMinutes } from '../lib/geo';
import type { FeeKind, LatLng, ParkingKind, ParkingLot } from '../types';

/** 本家が混んでいるときのために複数のミラーを順に試す */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** 一般利用できない駐車場の access タグ */
const CLOSED_ACCESS = new Set(['private', 'no', 'permit']);

const KIND_BY_TAG: Record<string, ParkingKind> = {
  surface: 'surface',
  multi_storey: 'multi-storey',
  underground: 'underground',
  rooftop: 'rooftop',
  street_side: 'street-side',
  lane: 'street-side',
};

function parseFee(tags: Record<string, string>): FeeKind {
  const fee = tags.fee?.toLowerCase();
  if (fee === 'yes' || tags.charge || tags['fee:conditions']) return 'paid';
  if (fee === 'no' || fee === 'free') return 'free';
  return 'unknown';
}

/** "50" や "約 50 台" から台数を取り出す。取れなければ null */
function parseCapacity(raw: string | undefined): number | null {
  if (!raw) return null;
  const matched = raw.match(/\d+/);
  if (!matched) return null;
  const value = Number(matched[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** "2.1" / "2.1 m" をメートル数にする。フィート表記などは判定不能として null */
function parseMaxHeight(raw: string | undefined): number | null {
  if (!raw) return null;
  const matched = raw.match(/^\s*(\d+(?:\.\d+)?)\s*m?\s*$/i);
  if (!matched) return null;
  const value = Number(matched[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseName(tags: Record<string, string>, kind: ParkingKind): string {
  const name = tags['name:ja'] || tags.name || tags.operator || tags.brand;
  if (name) return name;
  return kind === 'street-side' ? '路上パーキング' : '駐車場（名称なし）';
}

/**
 * Overpass の 1 要素を ParkingLot に変換する。
 * 座標が無いもの・一般利用できないものは null を返して呼び出し側で落とす。
 */
export function parseParkingElement(
  element: OverpassElement,
  destination: LatLng,
): ParkingLot | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const tags = element.tags ?? {};
  if (CLOSED_ACCESS.has(tags.access?.toLowerCase() ?? '')) return null;
  if (tags.parking === 'private') return null;

  const kind = KIND_BY_TAG[tags.parking ?? ''] ?? 'unknown';
  const distance = distanceMeters(destination, { lat, lng });

  return {
    id: `${element.type}/${element.id}`,
    name: parseName(tags, kind),
    lat,
    lng,
    fee: parseFee(tags),
    feeNote: tags.charge ?? tags['fee:conditions'] ?? null,
    kind,
    capacity: parseCapacity(tags.capacity),
    openingHours: tags.opening_hours ?? null,
    maxHeightM: parseMaxHeight(tags.maxheight),
    distanceM: Math.round(distance),
    walkMinutes: walkMinutes(distance),
  };
}

/** 情報量の多さ。重複時にどちらを残すか決めるのに使う */
function detailLevel(lot: ParkingLot): number {
  return (
    (lot.capacity !== null ? 1 : 0) +
    (lot.openingHours !== null ? 1 : 0) +
    (lot.fee !== 'unknown' ? 1 : 0) +
    (lot.kind !== 'unknown' ? 1 : 0)
  );
}

/**
 * 同じ駐車場が node と way の両方で登録されていることがあるので束ねる。
 * 名前が同じで 30m 以内なら同一とみなし、情報の多い方を残す。
 */
export function dedupeParking(lots: ParkingLot[]): ParkingLot[] {
  const kept: ParkingLot[] = [];

  for (const lot of lots) {
    const duplicate = kept.findIndex(
      (other) => other.name === lot.name && distanceMeters(other, lot) <= 30,
    );
    if (duplicate === -1) {
      kept.push(lot);
    } else if (detailLevel(lot) > detailLevel(kept[duplicate])) {
      kept[duplicate] = lot;
    }
  }

  return kept;
}

function buildQuery(destination: LatLng, radiusM: number): string {
  const around = `around:${radiusM},${destination.lat},${destination.lng}`;
  return `[out:json][timeout:25];
(
  node["amenity"="parking"](${around});
  way["amenity"="parking"](${around});
  relation["amenity"="parking"](${around});
);
out center tags;`;
}

/** 目的地の周辺半径 radiusM 以内の駐車場を取得する */
export async function fetchNearbyParking(
  destination: LatLng,
  radiusM: number,
  options: { signal?: AbortSignal } = {},
): Promise<ParkingLot[]> {
  const body = new URLSearchParams({ data: buildQuery(destination, radiusM) });
  let lastError: unknown = null;

  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body,
        signal: options.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = (await response.json()) as { elements?: OverpassElement[] };
      const lots = (json.elements ?? [])
        .map((element) => parseParkingElement(element, destination))
        .filter((lot): lot is ParkingLot => lot !== null);
      return dedupeParking(lots);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw new Error(
    `駐車場の検索に失敗しました${lastError instanceof Error ? `: ${lastError.message}` : ''}`,
  );
}
