import type { ParkingLot } from '../types';

const GOOGLE_SEARCH = 'https://www.google.com/search';

/**
 * 住所から検索に効く部分だけを取り出す。
 * 「大阪府 大阪市 中央区 宗右衛門町」のように長いままだと、
 * 語が増えるほど検索が絞られすぎて逆に当たらなくなる。
 */
export function areaKeyword(address: string | null | undefined): string {
  if (!address) return '';

  const parts = address
    .split(/[,、\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  // 末尾ほど狭い地名になるので、狭い方から 2 つ取って元の順に戻す
  return parts.slice(-2).join(' ');
}

/**
 * 駐車場の料金を Web で調べるための検索語を組み立てる。
 *
 * 名前が分かっていればそれを主語にする。名前が無い駐車場は
 * 固有名詞で引きようがないので、周辺の地名で「その辺りの駐車場料金」を探す。
 */
export function buildFeeSearchQuery(lot: ParkingLot, areaHint?: string | null): string {
  const area = areaKeyword(areaHint);
  const terms: string[] = [];

  if (lot.named) {
    terms.push(lot.name);
    // 「タイムズ○○」のように名前に運営者が含まれていれば足さない
    if (lot.operator && !lot.name.includes(lot.operator)) terms.push(lot.operator);
    // 同名の別店舗と混ざらないよう地域を足す。
    // ただし名前に既に入っている地名は、重ねても絞り込みが効かないので外す
    terms.push(...area.split(' ').filter((part) => part && !lot.name.includes(part)));
  } else if (area) {
    terms.push(area);
  }

  terms.push('駐車場', '料金');

  return [...new Set(terms)].join(' ');
}

/** 料金を調べるための検索ページの URL */
export function buildFeeSearchUrl(lot: ParkingLot, areaHint?: string | null): string {
  const params = new URLSearchParams({ q: buildFeeSearchQuery(lot, areaHint) });
  return `${GOOGLE_SEARCH}?${params.toString()}`;
}
