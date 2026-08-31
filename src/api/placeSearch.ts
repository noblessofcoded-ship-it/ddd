import { distanceMeters } from '../lib/geo';
import { buildQueryVariants, isRelevant, matchScore, normalizeQuery, tokenize } from '../lib/query';
import type { LatLng, Place } from '../types';
import { searchPlaces as searchNominatim } from './nominatim';
import { searchPlacesByName } from './overpass';
import { searchPlaces as searchPhoton } from './photon';
import { searchPlaces as searchYahoo } from './yahooLocal';

export type PlaceSearchOptions = {
  signal?: AbortSignal;
  /** 現在地。近い順に並べ替え、各サービスの検索も周辺優先にする */
  near?: LatLng | null;
  limit?: number;
  /**
   * Yahoo! ローカルサーチAPI の Client ID。
   * 設定されていれば、OSM に無い店舗も探せるようになる。
   */
  yahooAppId?: string | null;
  /**
   * 途中経過を受け取る。
   * 語を落とす再検索や Overpass の直引きは時間がかかるので、
   * 速い経路の結果を先に描いておき、後から差し替えるために使う。
   */
  onPartial?: (result: PlaceSearchResult) => void;
};

export type PlaceSearchResult = {
  /** 名前が検索語に一致した地点だけ。ここに無いものは「見つかった」とは呼べない */
  places: Place[];
  /**
   * 名前は一致しないが、検索サービスが近いものとして返してきた地点。
   * 「神楽亭」に対する「神楽殿」など。結果として並べると誤解を招くので、
   * 見つからなかったときに別枠で添えるだけにする。
   */
  nearMisses: Place[];
  /** 実際に投げたクエリ。入力そのままで足りなければ複数になる */
  triedQueries: string[];
  /** 語を落とすか地図データ直引きに頼った */
  relaxed: boolean;
  /**
   * いずれかの検索サービスが応答しなかった。
   * 「探して無かった」と「探せなかった」は利用者にとって意味が違うため区別する。
   */
  failed: boolean;
  /**
   * 地図データの名称検索（部分一致）まで進んだか。
   * ジオコーダは語の単位でしか一致を見ないため、「肉の天満屋 神楽亭」を
   * 「神楽亭」で引くにはこの経路が要る。現在地が無いと範囲を絞れず使えない。
   */
  usedNameSearch: boolean;
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

/**
 * 片方が落ちてももう片方の結果を返せるように、失敗は空配列として扱う。
 * ただし失敗したこと自体は記録する。「見つからない」と「調べられなかった」は
 * 利用者にとって意味が違うため。
 */
async function settled(promise: Promise<Place[]>, onFail: () => void): Promise<Place[]> {
  try {
    return await promise;
  } catch {
    onFail();
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
  const { signal, near = null, limit = 12, yahooAppId = null, onPartial } = options;
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length === 0) {
    return {
      places: [],
      nearMisses: [],
      triedQueries: [],
      relaxed: false,
      failed: false,
      usedNameSearch: false,
    };
  }

  const tokens = tokenize(rawQuery);
  const variants = buildQueryVariants(rawQuery);
  const triedQueries: string[] = [];
  let collected: Place[] = [];

  let usedNameSearch = false;
  let failed = false;
  const markFailed = () => {
    failed = true;
  };

  /** 今ある結果を整えて返す。途中経過の通知にも使う */
  const shape = (relaxed: boolean): PlaceSearchResult => {
    const ranked = rankPlaces(collected, tokens, near);
    // 名前が一致しないものを結果として並べると、探し物が見つかったように
    // 誤解させてしまう。別枠に回して、見つからなかったことは伝える
    return {
      places: ranked.filter((place) => isRelevant(place.name, tokens)).slice(0, limit),
      nearMisses: ranked.filter((place) => !isRelevant(place.name, tokens)).slice(0, limit),
      triedQueries: [...triedQueries],
      relaxed,
      failed,
      usedNameSearch,
    };
  };

  /**
   * 手の広げ方。上から順に試し、名前の合う結果が出た時点で止める。
   *
   * 2 段目で位置バイアスを外すのが肝。現在地の近さを強く効かせているぶん、
   * 離れた土地の店は上位に出てこない。1 段目で当たらなければ、
   * 全国から素直に探し直す必要がある。
   */
  const attempts: Array<{ query: string; near: LatLng | null }> = [
    { query: variants[0], near },
    ...(near ? [{ query: variants[0], near: null }] : []),
    ...(variants.length > 1 ? [{ query: variants[1], near }] : []),
  ];

  // 実際に何段目まで進んだか。1 段目で当たれば「緩めていない」
  let attemptsRun = 0;

  for (const attempt of attempts) {
    attemptsRun += 1;
    const [yahoo, photon, nominatim] = await Promise.all([
      // Yahoo! は独自の店舗データを持つので、OSM に無い店を拾える。
      // 先に置いて、同じ地点が重なったときはこちらの情報を残す
      settled(
        searchYahoo(attempt.query, yahooAppId, {
          signal,
          near: attempt.near,
          limit: FETCH_LIMIT,
        }),
        markFailed,
      ),
      settled(
        searchPhoton(attempt.query, { signal, near: attempt.near, limit: FETCH_LIMIT }),
        markFailed,
      ),
      settled(
        searchNominatim(attempt.query, { signal, near: attempt.near, limit: FETCH_LIMIT }),
        markFailed,
      ),
    ]);

    if (!triedQueries.includes(attempt.query)) triedQueries.push(attempt.query);
    collected = mergePlaces([collected, yahoo, photon, nominatim]);

    if (hasRelevantHit(collected, tokens) || signal?.aborted) break;

    // 当たりが無いので次の手に進むが、今ある結果は先に見せておく
    if (collected.length > 0) onPartial?.(shape(true));
  }

  // ジオコーダが名前の合うものを出せなかったときの最終手段。
  // 範囲を絞らないと重すぎるので、基準点が分かっているときだけ使える
  if (near && !signal?.aborted && !hasRelevantHit(collected, tokens)) {
    usedNameSearch = true;
    const byName = await settled(searchPlacesByName(tokens, near, { signal }), markFailed);
    if (byName.length > 0) collected = mergePlaces([collected, byName]);
  }

  return shape(attemptsRun > 1 || usedNameSearch);
}
