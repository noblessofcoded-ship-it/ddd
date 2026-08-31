import { distanceMeters } from '../lib/geo';
import { buildQueryVariants, normalizeQuery, tokenize } from '../lib/query';
import type { LatLng, Place } from '../types';
import { searchPlaces as searchNominatim } from './nominatim';
import { searchPlacesByName } from './overpass';
import { searchPlaces as searchPhoton } from './photon';

export type PlaceSearchOptions = {
  signal?: AbortSignal;
  /** 現在地。近い順に並べ替え、各サービスの検索も周辺優先にする */
  near?: LatLng | null;
  limit?: number;
};

export type PlaceSearchResult = {
  places: Place[];
  /** 語を落として再検索した場合、実際にヒットしたクエリ */
  matchedQuery: string;
  /** 入力そのままでは見つからず、緩めた条件で見つけた */
  relaxed: boolean;
};

/** 同一地点とみなす距離。同じ店が複数サービスから返るため */
const DEDUPE_DISTANCE_M = 60;

/**
 * 検索結果を束ねる。同じ場所が複数サービスから返るので、
 * 名前が同じで近接しているものは 1 件にまとめる。
 * 先に来たもの（＝優先度の高いサービスの結果）を残す。
 */
export function mergePlaces(groups: Place[][]): Place[] {
  const merged: Place[] = [];

  for (const group of groups) {
    for (const place of group) {
      const duplicate = merged.some(
        (other) =>
          other.name === place.name && distanceMeters(other, place) <= DEDUPE_DISTANCE_M,
      );
      if (!duplicate) merged.push(place);
    }
  }

  return merged;
}

/** 基準点がある場合に近い順へ並べ替える */
export function sortByDistance(places: Place[], near: LatLng | null | undefined): Place[] {
  if (!near) return places;
  return [...places].sort((a, b) => distanceMeters(near, a) - distanceMeters(near, b));
}

/** 片方が落ちてももう片方の結果を返せるように、失敗は空配列として扱う */
async function settled(promise: Promise<Place[]>): Promise<Place[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}

/**
 * 店名・施設名・住所から地点を検索する。
 *
 * 1. Photon と Nominatim を同時に引く（Photon は POI 名とタイポに強い）
 * 2. 見つからなければ語を落として再検索する
 *    （「台湾鍋 民生炒飯」→「民生炒飯」。OSM には屋号だけの登録が多いため）
 * 3. それでも駄目で現在地が分かっていれば、Overpass で name タグを直接引く
 *
 * どれか 1 つが落ちても、残りの結果は返す。
 */
export async function searchPlaces(
  rawQuery: string,
  options: PlaceSearchOptions = {},
): Promise<PlaceSearchResult> {
  const { signal, near = null, limit = 10 } = options;
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length === 0) {
    return { places: [], matchedQuery: normalized, relaxed: false };
  }

  const variants = buildQueryVariants(rawQuery);

  for (const [index, variant] of variants.entries()) {
    const [photon, nominatim] = await Promise.all([
      settled(searchPhoton(variant, { signal, near, limit })),
      settled(searchNominatim(variant, { signal, near, limit })),
    ]);

    const places = sortByDistance(mergePlaces([photon, nominatim]), near).slice(0, limit);
    if (places.length > 0) {
      return { places, matchedQuery: variant, relaxed: index > 0 };
    }
    if (signal?.aborted) break;
  }

  // 最後の手段。ジオコーダが拾えなくても OSM に name があれば見つかる
  if (near && !signal?.aborted) {
    const byName = await settled(searchPlacesByName(tokenize(rawQuery), near, { signal }));
    if (byName.length > 0) {
      return {
        places: sortByDistance(byName, near).slice(0, limit),
        matchedQuery: normalized,
        relaxed: false,
      };
    }
  }

  return { places: [], matchedQuery: normalized, relaxed: false };
}
