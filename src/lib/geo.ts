import type { LatLng } from '../types';

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 2 点間の直線距離をメートルで返す（ハバサイン公式） */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 直線距離から徒歩時間を見積もる。
 * 実際の歩道は迂回するので 1.3 倍し、分速 80m（不動産表示の慣習）で割る。
 */
export function walkMinutes(straightLineM: number): number {
  return Math.max(1, Math.round((straightLineM * 1.3) / 80));
}

/** 距離の表示用フォーマット（280m / 1.4km） */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** 複数地点をすべて含む矩形を返す。地図の初期表示に使う */
export function boundsOf(points: LatLng[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

const COMPASS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'] as const;

/**
 * from から見た to の方角を 8 方位で返す。
 *
 * 「タイムズ」のように名前が同じ駐車場が並ぶと区別が付かないので、
 * 目的地から見てどちら側かを添えて見分けられるようにする。
 */
export function compassDirection(from: LatLng, to: LatLng): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;

  // -180〜180 を 0〜360 に直し、45 度ごとに区切る
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return COMPASS[index];
}
