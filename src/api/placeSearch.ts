import { distanceMeters } from '../lib/geo';
import { buildQueryVariants, isRelevant, matchScore, normalizeQuery, tokenize } from '../lib/query';
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
  /** 実際に投げたクエリ。入力そのままで足りなければ複数になる */
  triedQueries: string[];
  /** 語を落とすか地図データ直引きに頼った */
  relaxed: boolean;
};

/** 同一地点とみなす距離。同じ店が複数サービスから返るため */
const DEDUPE_DISTANCE_M = 60;

/** 各サービスから受け取る件数。多めに取って手元で並べ替える */
const FETCH_LIMIT = 20;

/**
 * 検索結果を束ねる。同じ場所が複数サービスから返るので、
 * 名前が同じで近接しているものは 1 件にまとめる。
 */
export function mergePlaces(groups: Place[][]): Place[] {
  const merged: Place[] = [];

  for (const group of groups) {
    for (const place of group) {
      const duplicate = merged.some(
        (other) => other.name === place.name && distanceMeters(other, place) <= DEDUPE_DISTANCE_M,
      );
      if (!duplicate) merged.push(place);
    }
  }

  return merged;
}

/**
 * 名前の一致度を第一、現在地からの近さを第二の基準として並べ替える。
 *
 * 距離だけで並べると、検索語と関係のない近所の地点が上に来てしまう。
 * 逆に一致度だけだと、同名チェーンの遠い支店が上に来る。
 * 「まず名前が合っているもの、その中で近い順」がいちばん探しやすい。
 */
export function rankPlaces(places: Place[], tokens: string[], near: LatLng | null): Place[] {
  return [...places]
    .map((place) => ({
      place,
      score: matchScore(place.name, tokens),
      distance: near ? distanceMeters(near, place) : 0,
    }))
    .sort((a, b) => b.score - a.score || a.distance - b.distance)
    .map((entry) => entry.place);
}

/** 片方が落ちてももう片方の結果を返せるように、失敗は空配列として扱う */
async function settled(promise: Promise<Place[]>): Promise<Place[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}

/** 検索語に名前が合致した結果が 1 件でもあるか */
function hasRelevantHit(places: Place[], tokens: string[]): boolean {
  return places.some((place) => isRelevant(place.name, tokens));
}

/**
 * 店名・施設名・住所から地点を検索する。
 *
 * ジオコーダはタイポ許容なので「0 件かどうか」では当たり外れを判定できない。
 * 名前が検索語に合っている結果が出るまで、次の順に手を広げる。
 *
 * 1. Photon と Nominatim を同時に引く（Photon は POI 名に強い）
 * 2. 名前の合う結果が無ければ、語を落として引き直す
 *    （「台湾鍋 民生炒飯」→「民生炒飯」。OSM には屋号だけの登録が多い）
 * 3. それでも無く現在地が分かっていれば、Overpass で name タグを直接引く
 *    （チェーン店の各支店など、ジオコーダが上位に出さないものを拾う）
 *
 * 集めた結果は「名前の一致度 → 現在地からの近さ」で並べ替える。
 * どれか 1 つのサービスが落ちても、残りの結果は返す。
 */
export async function searchPlaces(
  rawQuery: string,
  options: PlaceSearchOptions = {},
): Promise<PlaceSearchResult> {
  const { signal, near = null, limit = 12 } = options;
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length === 0) {
    return { places: [], triedQueries: [], relaxed: false };
  }

  const tokens = tokenize(rawQuery);
  const variants = buildQueryVariants(rawQuery);
  const triedQueries: string[] = [];
  let collected: Place[] = [];

  // 語を落としながら最大 2 巡。これ以上広げても精度より負荷が勝る
  for (const variant of variants.slice(0, 2)) {
    const [photon, nominatim] = await Promise.all([
      settled(searchPhoton(variant, { signal, near, limit: FETCH_LIMIT })),
      settled(searchNominatim(variant, { signal, near, limit: FETCH_LIMIT })),
    ]);

    triedQueries.push(variant);
    collected = mergePlaces([collected, photon, nominatim]);

    if (hasRelevantHit(collected, tokens) || signal?.aborted) break;
  }

  // ジオコーダが名前の合うものを出せなかったときの最終手段
  let usedNameSearch = false;
  if (near && !signal?.aborted && !hasRelevantHit(collected, tokens)) {
    const byName = await settled(searchPlacesByName(tokens, near, { signal }));
    if (byName.length > 0) {
      collected = mergePlaces([collected, byName]);
      usedNameSearch = true;
    }
  }

  const ranked = rankPlaces(collected, tokens, near);

  // 名前の合うものが 1 件でもあるなら、合わないものは雑音なので落とす
  const relevant = ranked.filter((place) => isRelevant(place.name, tokens));
  const places = (relevant.length > 0 ? relevant : ranked).slice(0, limit);

  return {
    places,
    triedQueries,
    relaxed: triedQueries.length > 1 || usedNameSearch,
  };
}
