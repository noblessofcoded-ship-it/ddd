import type { ParkingFilters, ParkingLot, RankedParking } from '../types';
import { estimateFee, formatDuration, formatJpy, type FeeEstimate } from './fee';
import { formatDistance } from './geo';
import { evaluateOpeningHours, type OpenState } from './openingHours';

/** 各評価軸の重み。合計 100 になるようにしておく */
const WEIGHTS = {
  proximity: 45,
  fee: 25,
  capacity: 15,
  comfort: 15,
} as const;

/** 料金スコアの基準額。この額以上かかるものは 0 点にする */
const FEE_CEILING_JPY = 2000;

/** 屋根があるとみなす構造 */
const COVERED_KINDS = new Set(['multi-storey', 'underground']);

/** 時間貸し駐車場として素直に案内できる構造 */
const LOT_KINDS = new Set(['surface', 'multi-storey', 'underground', 'rooftop']);

/**
 * 情報が薄い駐車場に掛ける係数の下限。
 * 名前も台数も料金も無い点は、実体が駐車場かどうかも怪しいので
 * 総合点を 55% まで落とす。除外はしない（本当に駐車場のこともあるため）。
 */
const MIN_CONFIDENCE_FACTOR = 0.55;

/**
 * 登録情報がどれだけ揃っているかを 0〜1 で返す。
 *
 * OSM には amenity=parking とだけ書かれた点が大量にあり、住宅の車庫や
 * 建物の付属駐車場が混ざっている。これらは「近い」というだけで上位に来るが、
 * 実際には停められないことが多い。距離だけで並べないための重みにする。
 */
export function dataConfidence(lot: ParkingLot): number {
  const signals = [
    lot.named,
    lot.capacity !== null,
    lot.fee !== 'unknown',
    LOT_KINDS.has(lot.kind),
    lot.operator !== null || lot.openingHours !== null,
  ];
  return signals.filter(Boolean).length / signals.length;
}

/** カードに出す注意書き。鵜呑みにさせないためのもの */
function buildCautions(lot: ParkingLot, confidence: number): string[] {
  const cautions: string[] = [];

  if (lot.access === 'customers') {
    cautions.push('施設利用者専用の可能性があります');
  }
  if (lot.kind === 'street-side') {
    cautions.push('路上の駐車枠です');
  }
  if (confidence <= 0.2) {
    cautions.push('登録情報がほとんどなく、駐車場でない可能性があります');
  } else if (!lot.named && lot.capacity === null) {
    cautions.push('名称・台数が未登録です');
  }

  return cautions;
}

/** 「近いほど良い」を 0-1 に落とす。徒歩許容距離の 2 倍で 0 になる */
function proximityScore(distanceM: number, maxWalkM: number): number {
  const ceiling = Math.max(maxWalkM, 100) * 2;
  return clamp01(1 - distanceM / ceiling);
}

/**
 * 料金スコア。概算額が出せるならその額で評価し、
 * 出せない場合だけ fee タグによる大まかな区分に落とす。
 */
function feeScore(lot: ParkingLot, estimate: FeeEstimate | null): number {
  if (lot.fee === 'free') return 1;
  if (estimate !== null) return clamp01(1 - estimate.jpy / FEE_CEILING_JPY);
  if (lot.fee === 'paid') return 0.45; // 有料なのは分かるが額が不明
  return 0.35; // fee タグ自体が無い。期待を裏切らないよう有料寄りに見積もる
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

/** カードに出す推薦理由。上位 4 つまで */
function buildReasons(
  lot: ParkingLot,
  estimate: FeeEstimate | null,
  stayMinutes: number,
): string[] {
  const reasons: string[] = [];

  if (lot.walkMinutes <= 3) reasons.push(`目的地まで徒歩${lot.walkMinutes}分`);
  else reasons.push(`目的地まで${formatDistance(lot.distanceM)}`);

  if (lot.fee === 'free') reasons.push('無料');
  else if (estimate !== null) {
    reasons.push(
      estimate.capped
        ? `${formatJpy(estimate.jpy)}（最大料金）`
        : `${formatDuration(stayMinutes)}で${formatJpy(estimate.jpy)}`,
    );
  } else if (lot.feeNote) reasons.push(lot.feeNote);

  if (COVERED_KINDS.has(lot.kind)) reasons.push('屋根あり');
  if (lot.openingHours === '24/7') reasons.push('24時間');
  if (lot.capacity !== null && lot.capacity >= 50) reasons.push(`${lot.capacity}台`);

  return reasons.slice(0, 4);
}

/** フィルタを 1 件に適用する。true なら候補に残す */
export function matchesFilters(
  lot: ParkingLot,
  filters: ParkingFilters,
  openState: OpenState,
): boolean {
  if (lot.distanceM > filters.maxWalkM) return false;
  if (filters.freeOnly && lot.fee !== 'free') return false;
  if (filters.coveredOnly && !COVERED_KINDS.has(lot.kind)) return false;
  // 営業状態が判定できないものは落とさない（読めない書式が多いため）
  if (filters.openNowOnly && openState === 'closed') return false;
  if (filters.reliableOnly && dataConfidence(lot) < 0.4) return false;
  if (
    filters.vehicleHeightM !== null &&
    lot.maxHeightM !== null &&
    lot.maxHeightM < filters.vehicleHeightM
  ) {
    return false;
  }
  return true;
}

/**
 * 1 件のおすすめ度を 0-100 で返す。
 * 各軸の重みづけを出したうえで、登録情報の薄さと利用制限で割り引く。
 */
export function scoreParking(
  lot: ParkingLot,
  filters: ParkingFilters,
  estimate: FeeEstimate | null,
): number {
  const weighted =
    proximityScore(lot.distanceM, filters.maxWalkM) * WEIGHTS.proximity +
    feeScore(lot, estimate) * WEIGHTS.fee +
    capacityScore(lot.capacity) * WEIGHTS.capacity +
    comfortScore(lot) * WEIGHTS.comfort;

  const confidence = dataConfidence(lot);
  const factor = MIN_CONFIDENCE_FACTOR + (1 - MIN_CONFIDENCE_FACTOR) * confidence;

  // 別の施設の利用者専用は、行き先が違えば停められない
  const accessFactor = lot.access === 'customers' ? 0.75 : 1;
  // 路上の駐車枠は空きが読めず、そもそも停められないことも多い
  const kindFactor = lot.kind === 'street-side' ? 0.8 : 1;

  return Math.round(weighted * factor * accessFactor * kindFactor);
}

/**
 * 候補を絞り込み、スコア順に並べて返す。
 * 営業時間と料金は評価時刻・滞在時間に依存するので、ここでまとめて解決する。
 */
export function rankParking(
  lots: ParkingLot[],
  filters: ParkingFilters,
  options: { now?: Date; limit?: number } = {},
): RankedParking[] {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 12;

  return lots
    .map((lot) => ({ lot, openState: evaluateOpeningHours(lot.openingHours, now) }))
    .filter(({ lot, openState }) => matchesFilters(lot, filters, openState))
    .map(({ lot, openState }) => {
      const estimate = lot.fee === 'free' ? null : estimateFee(lot.parsedFee, filters.stayMinutes);
      const confidence = dataConfidence(lot);
      return {
        ...lot,
        score: scoreParking(lot, filters, estimate),
        reasons: buildReasons(lot, estimate, filters.stayMinutes),
        confidence,
        cautions: buildCautions(lot, confidence),
        estimatedFeeJpy: lot.fee === 'free' ? 0 : (estimate?.jpy ?? null),
        feeCapped: estimate?.capped ?? false,
        openState,
        exceedsMaxStay: lot.maxStayMinutes !== null && filters.stayMinutes > lot.maxStayMinutes,
      };
    })
    // 同点は近い順。表示が実行ごとに揺れないよう最後に id で固定する
    .sort((a, b) => b.score - a.score || a.distanceM - b.distanceM || a.id.localeCompare(b.id))
    .slice(0, limit);
}
