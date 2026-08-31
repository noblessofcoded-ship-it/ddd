import { EMPTY_FEE } from '../lib/fee';
import { distanceMeters, walkMinutes } from '../lib/geo';
import { jsonp } from '../lib/jsonp';
import type { LatLng, ParkingLot } from '../types';
import { parseCoordinates, type YahooResponse } from './yahooLocal';

const ENDPOINT = 'https://map.yahooapis.jp/search/local/V1/localSearch';

/** dist はキロメートル指定で、20km が上限 */
const MAX_DIST_KM = 20;

/** 駐車場とみなす業種名。Yahoo! は業種名を文字列で返す */
const PARKING_GENRE = /駐車場|パーキング/;

export function buildParkingSearchUrl(
  destination: LatLng,
  radiusM: number,
  appId: string,
  limit: number,
): string {
  const params = new URLSearchParams({
    appid: appId,
    query: '駐車場',
    lat: String(destination.lat),
    lon: String(destination.lng),
    dist: String(Math.min(MAX_DIST_KM, Math.max(0.1, radiusM / 1000))),
    sort: 'dist',
    results: String(limit),
    output: 'json',
  });
  return `${ENDPOINT}?${params.toString()}`;
}

/**
 * 業種名で駐車場だけに絞る。
 *
 * 「駐車場」という語での検索なので、名前にその語を含むだけの別業種
 * （不動産屋など）が混ざる。業種名で裏を取る。
 * 業種が付いていない場合は、名前にパーキング系の語があれば通す。
 */
export function isParkingFeature(
  genres: Array<{ Name?: string }> | undefined,
  name: string,
): boolean {
  const named = genres?.map((genre) => genre.Name ?? '') ?? [];
  if (named.length > 0) return named.some((genre) => PARKING_GENRE.test(genre));
  return PARKING_GENRE.test(name);
}

/** Yahoo! の応答を駐車場に変換する */
export function toParkingLots(response: YahooResponse, destination: LatLng): ParkingLot[] {
  return (response.Feature ?? []).flatMap((feature) => {
    const point = parseCoordinates(feature.Geometry?.Coordinates);
    const name = feature.Name?.trim();
    if (!point || !name) return [];
    if (!isParkingFeature(feature.Property?.Genre, name)) return [];

    const distance = distanceMeters(destination, point);

    // Yahoo! は店舗の所在情報が中心で、料金や車両制限は持っていない。
    // 無いものは無いままにして、OSM 側と突き合わせたときに補ってもらう
    return [
      {
        id: `yahoo:${feature.Property?.Uid ?? feature.Id ?? `${point.lat},${point.lng}`}`,
        source: 'yahoo' as const,
        name,
        named: true,
        address: feature.Property?.Address?.trim() || null,
        access: 'unknown' as const,
        operator: null,
        lat: point.lat,
        lng: point.lng,
        fee: 'unknown' as const,
        feeNote: null,
        feeSource: 'osm' as const,
        parsedFee: EMPTY_FEE,
        kind: 'unknown' as const,
        capacity: null,
        openingHours: null,
        maxStayMinutes: null,
        maxHeightM: null,
        maxWidthM: null,
        maxLengthM: null,
        surface: null,
        distanceM: Math.round(distance),
        walkMinutes: walkMinutes(distance),
      },
    ];
  });
}

/**
 * 目的地の周辺の駐車場を Yahoo! から取る。
 *
 * OSM に登録の無い駐車場を拾えるほか、「タイムズ」としか分からない
 * 駐車場に固有名と住所を与えられる。
 * Client ID が未設定なら何もせず空を返す。
 */
export async function fetchNearbyParking(
  destination: LatLng,
  radiusM: number,
  appId: string | null,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<ParkingLot[]> {
  if (!appId) return [];

  const response = await jsonp<YahooResponse>(
    buildParkingSearchUrl(destination, radiusM, appId, options.limit ?? 30),
    { signal: options.signal },
  );

  return toParkingLots(response, destination);
}
