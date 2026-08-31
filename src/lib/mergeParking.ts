import { distanceMeters } from './geo';
import type { ParkingLot } from '../types';

/** 同じ駐車場とみなす距離。区画の広い駐車場でも中心点はこの程度に収まる */
const SAME_LOT_DISTANCE_M = 45;

/** 比較用に名前を揃える */
function fold(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[\s　・･（）()]/g, '');
}

/**
 * 2 つの名前が同じ駐車場を指していそうか。
 *
 * OSM 側は「タイムズ」のような運営者名だけのことが多く、
 * Yahoo! 側は「タイムズ天満第2」のような固有名を持つ。
 * 片方がもう片方を含んでいれば同じものとみなす。
 */
export function namesLookSame(a: string, b: string): boolean {
  const left = fold(a);
  const right = fold(b);
  if (left.length === 0 || right.length === 0) return true;
  return left.includes(right) || right.includes(left);
}

/** OSM 側に名前が無いか、運営者名だけの状態か */
function lacksProperName(lot: ParkingLot): boolean {
  return !lot.named;
}

/**
 * 同じ駐車場を 1 件に合成する。
 *
 * OSM は料金や車両制限といった仕様を持ち、Yahoo! は固有名と住所を持つ。
 * どちらか一方だけでは不足するので、両方から埋める。
 */
export function combine(osm: ParkingLot, yahoo: ParkingLot): ParkingLot {
  return {
    ...osm,
    // 固有名が無いか運営者名だけなら、Yahoo! の名前の方が役に立つ
    name: lacksProperName(osm) ? yahoo.name : osm.name,
    named: osm.named || yahoo.named,
    address: osm.address ?? yahoo.address,
  };
}

/**
 * OSM と Yahoo! の駐車場を突き合わせる。
 *
 * 近接していて名前が矛盾しないものは同じ駐車場として合成し、
 * 片方にしかないものはそのまま残す。
 */
export function mergeParking(osmLots: ParkingLot[], yahooLots: ParkingLot[]): ParkingLot[] {
  const merged = [...osmLots];
  const usedYahoo = new Set<string>();

  merged.forEach((lot, index) => {
    const match = yahooLots.find(
      (candidate) =>
        !usedYahoo.has(candidate.id) &&
        distanceMeters(lot, candidate) <= SAME_LOT_DISTANCE_M &&
        namesLookSame(lot.name, candidate.name),
    );
    if (!match) return;

    usedYahoo.add(match.id);
    merged[index] = combine(lot, match);
  });

  // OSM に無かった駐車場を足す
  return [...merged, ...yahooLots.filter((lot) => !usedYahoo.has(lot.id))];
}
