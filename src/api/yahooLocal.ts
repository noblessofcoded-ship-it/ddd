import { jsonp } from '../lib/jsonp';
import type { LatLng, Place } from '../types';

const ENDPOINT = 'https://map.yahooapis.jp/search/local/V1/localSearch';

/** Yahoo! ローカルサーチAPI の応答（使う部分だけ） */
export type YahooResponse = {
  ResultInfo?: { Count?: number; Status?: number };
  Feature?: Array<{
    Id?: string;
    Name?: string;
    Geometry?: { Coordinates?: string };
    Property?: {
      Uid?: string;
      Address?: string;
      Genre?: Array<{ Name?: string }>;
    };
  }>;
};

/**
 * Geometry.Coordinates は "経度,緯度" の文字列で来る。
 * 緯度経度の順が地図系の慣習と逆なので、ここで必ず入れ替える。
 */
export function parseCoordinates(raw: string | undefined): LatLng | null {
  if (!raw) return null;
  const [lon, lat] = raw.split(',').map((part) => Number(part.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lng: lon };
}

/** 応答を、このアプリの地点の形に直す */
export function toPlaces(response: YahooResponse): Place[] {
  return (response.Feature ?? []).flatMap((feature) => {
    const point = parseCoordinates(feature.Geometry?.Coordinates);
    const name = feature.Name?.trim();
    if (!point || !name) return [];

    const id = feature.Property?.Uid ?? feature.Id ?? `${point.lat},${point.lng}`;
    return [
      {
        id: `yahoo:${id}`,
        name,
        address: feature.Property?.Address?.trim() ?? '',
        lat: point.lat,
        lng: point.lng,
      },
    ];
  });
}

export function buildSearchUrl(
  query: string,
  appId: string,
  options: { near?: LatLng | null; limit?: number } = {},
): string {
  const params = new URLSearchParams({
    appid: appId,
    query,
    output: 'json',
    results: String(options.limit ?? 20),
  });

  // 現在地が分かっていれば近い順に並べてもらう。
  // 半径は指定しない（絞ると離れた土地の店が落ちるため）
  if (options.near) {
    params.set('lat', String(options.near.lat));
    params.set('lon', String(options.near.lng));
    params.set('sort', 'dist');
  }

  return `${ENDPOINT}?${params.toString()}`;
}

/**
 * 店名・施設名で地点を検索する。
 *
 * Yahoo! は全国の電話帳データをもとにした独自の店舗情報を持っており、
 * OpenStreetMap に登録されていない店でも見つかることがある。
 * Client ID が未設定なら何もせず空を返す（アプリは OSM だけで動き続ける）。
 */
export async function searchPlaces(
  query: string,
  appId: string | null,
  options: { signal?: AbortSignal; near?: LatLng | null; limit?: number } = {},
): Promise<Place[]> {
  const trimmed = query.trim();
  if (!appId || trimmed.length === 0) return [];

  const response = await jsonp<YahooResponse>(
    buildSearchUrl(trimmed, appId, { near: options.near, limit: options.limit }),
    { signal: options.signal },
  );

  return toPlaces(response);
}
