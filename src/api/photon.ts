import type { LatLng, Place } from '../types';

const ENDPOINT = 'https://photon.komoot.io/api';

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

/** 日本の住所は 都道府県 → 市区町村 → 番地 の順に並べる */
function buildAddress(props: NonNullable<PhotonFeature['properties']>): string {
  const parts = [
    props.state,
    props.county,
    props.city,
    props.district,
    props.street,
    props.housenumber,
  ].filter((part): part is string => Boolean(part));

  return [...new Set(parts)].join(' ');
}

/**
 * 店名や施設名で地点を検索する。
 * Photon はタイポ許容と位置バイアスに対応しており、Nominatim が苦手な
 * POI 名での検索に強い。APIキーは不要。
 */
export async function searchPlaces(
  query: string,
  options: { signal?: AbortSignal; limit?: number; near?: LatLng | null } = {},
): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const params = new URLSearchParams({
    q: trimmed,
    limit: String(options.limit ?? 10),
  });

  // 現在地が分かっていれば、その周辺を優先させる
  if (options.near) {
    params.set('lat', String(options.near.lat));
    params.set('lon', String(options.near.lng));
    // location_bias_scale は小さいほど「有名さ」より「近さ」を優先する。
    // 目当ての店は近所にある前提のアプリなので、かなり近さ寄りに倒す。
    params.set('location_bias_scale', '0.1');
    // zoom は絞り込みの強さ。13 でおおよそ市街地スケール
    params.set('zoom', '13');
  }

  const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
    signal: options.signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`地点検索に失敗しました (HTTP ${response.status})`);
  }

  const json = (await response.json()) as { features?: PhotonFeature[] };

  return (json.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates;
    const props = feature.properties;
    if (!coordinates || !props) return [];

    const [lng, lat] = coordinates;
    if (typeof lat !== 'number' || typeof lng !== 'number') return [];

    const name = props.name ?? props.street ?? props.city;
    if (!name) return [];

    return [
      {
        id: `photon:${props.osm_type ?? '?'}/${props.osm_id ?? `${lat},${lng}`}`,
        name,
        address: buildAddress(props),
        lat,
        lng,
      },
    ];
  });
}

/**
 * 座標から地点名を引く（逆ジオコーディング）。
 * 地図をタップして目的地を決めたときに、座標だけでなく地名を出すために使う。
 * 失敗しても致命的ではないので、呼び出し側で null を許容すること。
 */
export async function reverseGeocode(
  point: LatLng,
  options: { signal?: AbortSignal } = {},
): Promise<Place | null> {
  const params = new URLSearchParams({
    lat: String(point.lat),
    lon: String(point.lng),
    limit: '1',
  });

  const response = await fetch(`${ENDPOINT.replace(/\/api$/, '')}/reverse?${params.toString()}`, {
    signal: options.signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;

  const json = (await response.json()) as { features?: PhotonFeature[] };
  const props = json.features?.[0]?.properties;
  if (!props) return null;

  const name = props.name ?? props.street ?? props.city;
  const address = buildAddress(props);
  if (!name && !address) return null;

  // 座標はタップした位置を優先する。返ってきた地点は名前を得るためだけに使う
  return {
    id: `pin:${point.lat.toFixed(6)},${point.lng.toFixed(6)}`,
    name: name ?? address,
    address,
    lat: point.lat,
    lng: point.lng,
  };
}
