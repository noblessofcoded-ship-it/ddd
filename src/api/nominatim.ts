import type { LatLng, Place } from '../types';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
};

/** display_name の先頭要素を店名、残りを住所として切り分ける */
function splitDisplayName(result: NominatimResult): { name: string; address: string } {
  const parts = result.display_name.split(',').map((s) => s.trim());
  const name = result.name?.trim() || parts[0] || result.display_name;
  const rest = parts[0] === name ? parts.slice(1) : parts;
  return { name, address: rest.join(', ') };
}

/**
 * 店名・施設名・住所から候補地点を検索する。
 * Nominatim の利用規約上、キー入力ごとに呼ばず必ずデバウンス経由で使うこと。
 */
export async function searchPlaces(
  query: string,
  options: { signal?: AbortSignal; limit?: number; near?: LatLng | null } = {},
): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    addressdetails: '0',
    limit: String(options.limit ?? 10),
    'accept-language': 'ja',
  });

  // 現在地が分かっていれば周辺を優先する。bounded=0 なので範囲外も落とさない
  if (options.near) {
    const span = 0.25; // 緯度経度で約 28km。広すぎると近所の店が埋もれる
    const { lat, lng } = options.near;
    params.set('viewbox', [lng - span, lat + span, lng + span, lat - span].join(','));
    params.set('bounded', '0');
  }

  const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
    signal: options.signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`地点検索に失敗しました (HTTP ${response.status})`);
  }

  const results = (await response.json()) as NominatimResult[];

  return results.map((result) => {
    const { name, address } = splitDisplayName(result);
    return {
      id: String(result.place_id),
      name,
      address,
      lat: Number(result.lat),
      lng: Number(result.lon),
    };
  });
}
