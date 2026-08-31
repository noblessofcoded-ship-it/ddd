import type { ParkingLot, VehicleSize } from '../types';

/**
 * 車種ごとの代表的な寸法（m）。
 *
 * 各区分の中でも大きめの値を採り、「入れると言ったのに入らない」を避ける。
 * 軽自動車は幅こそ狭いが、近年の主力は全高 1.7m 前後あり、
 * 立体駐車場の 1.55m 制限には入らない。高さは車種区分と一致しない。
 */
export const VEHICLE_PRESETS: VehicleSize[] = [
  { label: '軽自動車', widthM: 1.48, heightM: 1.7, lengthM: 3.4 },
  { label: 'コンパクト・セダン', widthM: 1.75, heightM: 1.55, lengthM: 4.7 },
  { label: 'ミニバン・SUV', widthM: 1.85, heightM: 1.95, lengthM: 4.95 },
  { label: '大型ミニバン', widthM: 1.9, heightM: 1.95, lengthM: 5.2 },
];

export function findVehicle(label: string): VehicleSize | null {
  return VEHICLE_PRESETS.find((preset) => preset.label === label) ?? null;
}

/**
 * その車が入れない駐車場かどうか。
 * 制限が登録されていない項目は判断材料が無いので、入れない扱いにはしない。
 */
export function exceedsLimits(lot: ParkingLot, vehicle: VehicleSize): boolean {
  return (
    (lot.maxHeightM !== null && lot.maxHeightM < vehicle.heightM) ||
    (lot.maxWidthM !== null && lot.maxWidthM < vehicle.widthM) ||
    (lot.maxLengthM !== null && lot.maxLengthM < vehicle.lengthM)
  );
}

/** その制限が、乗る車に対してどうか */
export type LimitStatus =
  /** OSM に登録が無い。制限が無いとは限らない */
  | 'unknown'
  /** 余裕がある */
  | 'ok'
  /** 入るがぎりぎり */
  | 'tight';

/** ぎりぎりとみなす余裕（m）。ミラーや開扉を考えるとこの程度は見ておきたい */
const TIGHT_MARGIN_M = 0.05;

/**
 * 制限値と車の寸法を突き合わせる。
 *
 * 入れない駐車場は候補から外しているので、ここで扱うのは
 * 「余裕があるか、ぎりぎりか」だけになる。
 */
export function limitStatus(limitM: number | null, vehicleM: number | null): LimitStatus {
  if (limitM === null) return 'unknown';
  if (vehicleM === null) return 'ok';
  return limitM - vehicleM <= TIGHT_MARGIN_M ? 'tight' : 'ok';
}
