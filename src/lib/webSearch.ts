import type { ParkingLot } from '../types';

const GOOGLE_SEARCH = 'https://www.google.com/search';

/** 固有名がある場合に添える地名の数。名前だけでほぼ特定できる */
const AREA_PARTS_WITH_NAME = 2;
/** 固有名が無い場合に添える地名の数。地名で絞るしかないので厚くする */
const AREA_PARTS_WITHOUT_NAME = 4;

/**
 * 住所から検索に効く部分を、狭い地名から順に取り出す。
 * 「大阪府 大阪市 中央区 宗右衛門町 2-3」の末尾ほど場所を絞り込める。
 */
export function areaKeywords(address: string | null | undefined, count: number): string[] {
  if (!address) return [];

  const parts = address
    .split(/[,、\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.slice(-count);
}

/**
 * 駐車場の料金を Web で調べるための検索語を組み立てる。
 *
 * 「タイムズ」のような運営者名だけでは、どのタイムズか分からず役に立たない。
 * その場所を特定できる語（固有名、住所）をできるだけ足す。
 *
 * @param areaHint 駐車場自身の住所が無いときに使う、目的地側の住所
 */
export function buildFeeSearchQuery(lot: ParkingLot, areaHint?: string | null): string {
  const terms: string[] = [];

  if (lot.named) {
    terms.push(lot.name);
    // 「タイムズ○○」のように名前に運営者が含まれていれば足さない
    if (lot.operator && !lot.name.includes(lot.operator)) terms.push(lot.operator);
  } else if (lot.operator) {
    // 運営者しか分からない場合。これだけでは特定できないので地名を厚めに足す
    terms.push(lot.operator);
  }

  // 駐車場自身の住所があればそちらの方が正確。無ければ目的地の住所で代用する
  const count = lot.named ? AREA_PARTS_WITH_NAME : AREA_PARTS_WITHOUT_NAME;
  const area = areaKeywords(lot.address ?? areaHint, count);

  // 名前に既に入っている地名は、重ねても絞り込みが効かないので外す
  terms.push(...area.filter((part) => !terms.some((term) => term.includes(part))));

  terms.push('駐車場', '料金');

  return [...new Set(terms)].join(' ');
}

/** 料金を調べるための検索ページの URL */
export function buildFeeSearchUrl(lot: ParkingLot, areaHint?: string | null): string {
  const params = new URLSearchParams({ q: buildFeeSearchQuery(lot, areaHint) });
  return `${GOOGLE_SEARCH}?${params.toString()}`;
}
