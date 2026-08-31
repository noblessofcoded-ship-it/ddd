import { distanceMeters } from './geo';
import type { ParkingLot } from '../types';

/**
 * 同じ駐車場とみなす距離。
 * 名前で裏が取れる場合は広めに見る。OSM は区画の中心点、Yahoo! は
 * 出入口付近を指していることがあり、同じ駐車場でもずれるため。
 */
const SAME_LOT_DISTANCE_M = 70;

/**
 * 名前で裏が取れない場合の距離。
 * 「駐車場（名称なし）」のように名前が手がかりにならないときは、
 * 別の駐車場を巻き込まないよう近さだけで慎重に判断する。
 */
const UNNAMED_DISTANCE_M = 30;

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

/** 固有名が無く、名前が突き合わせの手がかりにならない状態か */
function lacksProperName(lot: ParkingLot): boolean {
  return !lot.named;
}

/**
 * 同じ駐車場とみなせるか。
 *
 * 名前が手がかりにならない側があるときは、名前の不一致を理由に
 * 別物と決めつけない。代わりに距離を厳しくする。
 */
export function isSameLot(osm: ParkingLot, yahoo: ParkingLot): boolean {
  const distance = distanceMeters(osm, yahoo);
  if (lacksProperName(osm) && !namesLookSame(osm.name, yahoo.name)) {
    return distance <= UNNAMED_DISTANCE_M;
  }
  return distance <= SAME_LOT_DISTANCE_M && namesLookSame(osm.name, yahoo.name);
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

/** 突き合わせの結果。何がどれだけ効いたかを画面に出すために使う */
export type MergeResult = {
  lots: ParkingLot[];
  /** 同じ駐車場として合成した件数 */
  combined: number;
  /** Yahoo! にしかなかった駐車場の件数 */
  addedFromYahoo: number;
};

/**
 * OSM と Yahoo! の駐車場を突き合わせる。
 *
 * 同じ駐車場と判断したものは合成し、片方にしかないものはそのまま残す。
 */
export function mergeParking(osmLots: ParkingLot[], yahooLots: ParkingLot[]): MergeResult {
  const merged = [...osmLots];
  const usedYahoo = new Set<string>();

  merged.forEach((lot, index) => {
    const match = yahooLots.find(
      (candidate) => !usedYahoo.has(candidate.id) && isSameLot(lot, candidate),
    );
    if (!match) return;

    usedYahoo.add(match.id);
    merged[index] = combine(lot, match);
  });

  const onlyYahoo = yahooLots.filter((lot) => !usedYahoo.has(lot.id));

  return {
    lots: [...merged, ...onlyYahoo],
    combined: usedYahoo.size,
    addedFromYahoo: onlyYahoo.length,
  };
}
