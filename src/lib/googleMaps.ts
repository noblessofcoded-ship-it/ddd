import type { LatLng } from '../types';

const DIR_BASE = 'https://www.google.com/maps/dir/';
const SEARCH_BASE = 'https://www.google.com/maps/search/';

/** 経由地つきか、駐車場までで切るか */
export type HandoffMode = 'direct' | 'via-parking' | 'to-parking';

export type HandoffInput = {
  /** 出発地。未指定なら Google Maps 側で現在地が使われる */
  origin: LatLng | null;
  destination: LatLng;
  /** 駐車場を使わないなら null */
  parking: LatLng | null;
  mode: HandoffMode;
  /** true なら Google Maps を開いた直後にナビを開始する */
  navigate?: boolean;
};

/**
 * 座標を Google Maps URL のパラメータ形式にする。
 * 桁を落としすぎると隣の区画を指してしまうので 6 桁（約 10cm）残す。
 */
export function formatLatLng(point: LatLng): string {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

/**
 * Google Maps の Directions URL を組み立てる。
 * - direct:       出発地 → 目的地（車）
 * - via-parking:  出発地 → 駐車場（経由）→ 目的地（車）
 * - to-parking:   出発地 → 駐車場（車）。そこから先は歩く前提
 */
export function buildDirectionsUrl(input: HandoffInput): string {
  const { origin, destination, parking, mode, navigate = false } = input;

  if (mode !== 'direct' && parking === null) {
    throw new Error('駐車場を使うモードでは parking が必要です');
  }

  const params = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (origin) params.set('origin', formatLatLng(origin));

  if (mode === 'to-parking' && parking) {
    params.set('destination', formatLatLng(parking));
  } else {
    params.set('destination', formatLatLng(destination));
    if (mode === 'via-parking' && parking) {
      params.set('waypoints', formatLatLng(parking));
    }
  }

  if (navigate) params.set('dir_action', 'navigate');

  return `${DIR_BASE}?${params.toString()}`;
}

/** 駐車場 → 目的地の徒歩ルート。車を停めた後にひらく用 */
export function buildWalkUrl(parking: LatLng, destination: LatLng): string {
  const params = new URLSearchParams({
    api: '1',
    travelmode: 'walking',
    origin: formatLatLng(parking),
    destination: formatLatLng(destination),
  });
  return `${DIR_BASE}?${params.toString()}`;
}

/** 1 地点を Google Maps で開く（駐車場の詳細を確認したいとき用） */
export function buildPlaceUrl(point: LatLng, query?: string): string {
  const params = new URLSearchParams({
    api: '1',
    query: query?.trim() ? query.trim() : formatLatLng(point),
  });
  return `${SEARCH_BASE}?${params.toString()}`;
}
