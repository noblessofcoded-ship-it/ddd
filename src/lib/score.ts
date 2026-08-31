import type { ParkingFilters, ParkingLot, RankedParking } from '../types';
import { formatDistance } from './geo';

/** 各評価軸の重み。合計 100 になるようにしておく */
const WEIGHTS = {
  proximity: 50,
  fee: 20,
  capacity: 15,
  comfort: 15,
} as const;

/** 屋根があるとみなす構造 */
const COVERED_KINDS = new Set(['multi-storey', 'underground']);

/** 「近いほど良い」を 0-1 に落とす。徒歩許容距離の 2 倍で 0 になる */
function proximityScore(distanceM: number, maxWalkM: number): number {
  const ceiling = Math.max(maxWalkM, 100) * 2;
  return clamp01(1 - distanceM / ceiling);
}

function feeScore(lot: ParkingLot): number {
  if (lot.fee === 'free') return 1;
  if (lot.fee === 'paid') return 0.5;
  return 0.35; // 不明は有料寄りに見積もる（期待を裏切らない方向に倒す）
}

/**
 * 収容台数が多いほど満車を避けやすい、という前提のスコア。
 * 100 台で頭打ちにして、大型施設が小型を一方的に押しのけないようにする。
 */
function capacityScore(capacity: number | null): number {
  if (capacity === null) return 0.4;
  return clamp01(capacity / 100);
}

/** 屋根あり・24時間営業といった快適さの加点 */
function comfortScore(lot: ParkingLot): number {
  let score = 0.3;
  if (COVERED_KINDS.has(lot.kind)) score += 0.4;
  if (lot.openingHours === '24/7') score += 0.3;
  else if (lot.openingHours) score += 0.1;
  return clamp01(score);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** カードに出す推薦理由。上位 3 つまで */
function buildReasons(lot: ParkingLot): string[] {
  const reasons: string[] = [];

  if (lot.walkMinutes <= 3) reasons.push(`目的地まで徒歩${lot.walkMinutes}分`);
  else reasons.push(`目的地まで${formatDistance(lot.distanceM)}`);

  if (lot.fee === 'free') reasons.push('無料');
  else if (lot.feeNote) reasons.push(lot.feeNote);

  if (COVERED_KINDS.has(lot.kind)) reasons.push('屋根あり');
  if (lot.openingHours === '24/7') reasons.push('24時間');
  if (lot.capacity !== null && lot.capacity >= 50) reasons.push(`${lot.capacity}台`);

  return reasons.slice(0, 3);
}

/** フィルタを 1 件に適用する。true なら候補に残す */
export function matchesFilters(lot: ParkingLot, filters: ParkingFilters): boolean {
  if (lot.distanceM > filters.maxWalkM) return false;
  if (filters.freeOnly && lot.fee !== 'free') return false;
  if (filters.coveredOnly && !COVERED_KINDS.has(lot.kind)) return false;
  if (
    filters.vehicleHeightM !== null &&
    lot.maxHeightM !== null &&
    lot.maxHeightM < filters.vehicleHeightM
  ) {
    return false;
  }
  return true;
}

/** 1 件のおすすめ度を 0-100 で返す */
export function scoreParking(lot: ParkingLot, filters: ParkingFilters): number {
  const weighted =
    proximityScore(lot.distanceM, filters.maxWalkM) * WEIGHTS.proximity +
    feeScore(lot) * WEIGHTS.fee +
    capacityScore(lot.capacity) * WEIGHTS.capacity +
    comfortScore(lot) * WEIGHTS.comfort;

  return Math.round(weighted);
}

/** 候補を絞り込み、スコア順に並べて返す */
export function rankParking(
  lots: ParkingLot[],
  filters: ParkingFilters,
  limit = 12,
): RankedParking[] {
  return lots
    .filter((lot) => matchesFilters(lot, filters))
    .map((lot) => ({ ...lot, score: scoreParking(lot, filters), reasons: buildReasons(lot) }))
    // 同点は近い順。表示が実行ごとに揺れないよう最後に id で固定する
    .sort((a, b) => b.score - a.score || a.distanceM - b.distanceM || a.id.localeCompare(b.id))
    .slice(0, limit);
}
