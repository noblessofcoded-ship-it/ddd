import { parseCharge, parseMaxStay } from '../lib/fee';
import { distanceMeters, walkMinutes } from '../lib/geo';
import type { FeeKind, LatLng, ParkingKind, ParkingLot, Place } from '../types';

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

/**
 * 料金が書かれていそうなタグを、書式のゆれを含めて集める。
 *
 * OSM の料金は charge に統一されておらず、fee:conditions、条件付き構文
 * （charge:conditional）、旧来の parking:condition:N:charge などに散っている。
 * どれか 1 つだけ見ていると「料金不明」になる駐車場がかなり増えるため、
 * 見つかったものを全部つないで解釈に回す。
 */
function collectChargeText(tags: Record<string, string>): string | null {
  const direct = [
    tags.charge,
    tags['charge:conditional'],
    tags['fee:conditions'],
    tags['fee:conditional'],
    tags['parking:fee'],
    tags['parking:charge'],
  ];

  // parking:condition:1:charge のような連番タグも拾う
  const numbered = Object.entries(tags)
    .filter(([key]) => /^parking:condition:\d+:(charge|fee)$/.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  const parts = [...direct, ...numbered]
    .filter((part): part is string => Boolean(part && part.trim()))
    // 金額を含まない条件文（"no @ customers" など）は料金の手がかりにならず、
    // そのまま画面に出しても読み手の役に立たないので落とす
    .filter((part) => /\d/.test(part));

  return parts.length > 0 ? [...new Set(parts)].join(' ') : null;
}

function parseFee(tags: Record<string, string>, chargeText: string | null): FeeKind {
  const fee = tags.fee?.toLowerCase();
  if (fee === 'yes' || chargeText) return 'paid';
  if (fee === 'no' || fee === 'free') return 'free';
  // fee タグが無くても、条件付きで有料と書かれていれば有料とみなす
  if (/yes/i.test(tags['fee:conditional'] ?? '')) return 'paid';
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
  const feeNote = collectChargeText(tags);

  return {
    id: `${element.type}/${element.id}`,
    name: parseName(tags, kind),
    lat,
    lng,
    fee: parseFee(tags, feeNote),
    feeNote,
    parsedFee: parseCharge(feeNote),
    kind,
    capacity: parseCapacity(tags.capacity),
    openingHours: tags.opening_hours ?? null,
    maxStayMinutes: parseMaxStay(tags.maxstay ?? tags['parking:condition:1:maxstay']),
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

/**
 * Overpass に問い合わせる。本家が混んでいることがあるのでミラーを順に試す。
 */
async function postOverpass(
  data: string,
  signal?: AbortSignal,
): Promise<{ elements?: OverpassElement[] }> {
  const body = new URLSearchParams({ data });
  let lastError: unknown = null;

  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body,
        signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as { elements?: OverpassElement[] };
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw new Error(
    `Overpass への問い合わせに失敗しました${lastError instanceof Error ? `: ${lastError.message}` : ''}`,
  );
}

/** Overpass QL の正規表現リテラルに安全に埋め込めるようにする */
export function escapeForOverpassRegex(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    // 利用者の入力は正規表現ではなくただの文字列として扱う
    .replace(/[.*+?^${}()|[\]]/g, '\\$&');
}

/**
 * 名前で地点を探す Overpass 検索。
 * ジオコーダ（Photon / Nominatim）が拾えなかった POI でも、OSM 上に
 * データさえあれば name タグの部分一致で見つけられることがある。
 *
 * 語は選択和（民生炒飯|台湾鍋）で 1 度に問い合わせる。
 * 「台湾鍋 民生炒飯」のような複数語をそのまま正規表現にすると、
 * 空白ごと一致する名前しか引っかからず必ず空振りするため。
 * 範囲を絞らないと重すぎるので、必ず基準点まわりの半径で検索する。
 */
export async function searchPlacesByName(
  terms: string[],
  near: LatLng,
  options: { signal?: AbortSignal; radiusM?: number; limit?: number } = {},
): Promise<Place[]> {
  // 1 文字の語は一致が多すぎて実用にならないので落とす
  const usable = terms.map((term) => term.trim()).filter((term) => term.length >= 2);
  if (usable.length === 0) return [];

  const radius = options.radiusM ?? 30_000;
  const limit = options.limit ?? 20;
  const around = `around:${radius},${near.lat},${near.lng}`;
  const pattern = usable.map(escapeForOverpassRegex).join('|');

  const data = `[out:json][timeout:25];
(
  node["name"~"${pattern}"](${around});
  way["name"~"${pattern}"](${around});
);
out center tags ${limit};`;

  const json = await postOverpass(data, options.signal);

  return (json.elements ?? []).flatMap((element) => {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    const name = element.tags?.['name:ja'] ?? element.tags?.name;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !name) return [];

    const address = [
      element.tags?.['addr:province'] ?? element.tags?.['addr:state'],
      element.tags?.['addr:city'],
      element.tags?.['addr:suburb'],
      element.tags?.['addr:block_number'],
      element.tags?.['addr:housenumber'],
    ]
      .filter(Boolean)
      .join(' ');

    return [{ id: `osm:${element.type}/${element.id}`, name, address, lat, lng }];
  });
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
  const json = await postOverpass(buildQuery(destination, radiusM), options.signal);

  const lots = (json.elements ?? [])
    .map((element) => parseParkingElement(element, destination))
    .filter((lot): lot is ParkingLot => lot !== null);

  return dedupeParking(lots);
}
