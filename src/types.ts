import type { ParsedFee } from './lib/fee';
import type { OpenState } from './lib/openingHours';

/** 緯度経度 */
export type LatLng = {
  lat: number;
  lng: number;
};

/** 目的地・出発地として選べる地点 */
export type Place = LatLng & {
  id: string;
  /** 表示名（店名・施設名） */
  name: string;
  /** 住所などの補足行 */
  address: string;
};

/** 誰が停められるか。OSM の access タグから判定する */
export type AccessKind =
  /** 誰でも停められる */
  | 'public'
  /** その施設の利用者だけ。別の店に行くのには使えない */
  | 'customers'
  /** 記載なし */
  | 'unknown';

/** 料金の区分。OSM の fee タグから判定する */
export type FeeKind = 'free' | 'paid' | 'unknown';

/** 駐車場の構造。屋根の有無の判断に使う */
export type ParkingKind =
  | 'surface'
  | 'multi-storey'
  | 'underground'
  | 'rooftop'
  | 'street-side'
  | 'unknown';

/** OSM から取得した駐車場 1 件 */
export type ParkingLot = LatLng & {
  id: string;
  name: string;
  /** OSM に名前が登録されていたか。未登録なら name は既定の文言 */
  named: boolean;
  /** 利用制限 */
  access: AccessKind;
  /** 運営者・ブランド名 */
  operator: string | null;
  fee: FeeKind;
  /** 料金の説明文（`fee:conditions` や `charge` タグ） */
  feeNote: string | null;
  /** 料金文字列から読み取れた単価・最大料金 */
  parsedFee: ParsedFee;
  kind: ParkingKind;
  /** 収容台数。不明なら null */
  capacity: number | null;
  /** 営業時間の生文字列（例: "24/7"） */
  openingHours: string | null;
  /** 最大駐車時間（分）。制限なし・不明なら null */
  maxStayMinutes: number | null;
  /** 車高制限（m）。不明なら null */
  maxHeightM: number | null;
  /** 目的地からの直線距離(m) */
  distanceM: number;
  /** 目的地までの推定徒歩時間(分) */
  walkMinutes: number;
};

/** スコアリング結果つきの駐車場 */
export type RankedParking = ParkingLot & {
  /** 0-100 の総合おすすめ度 */
  score: number;
  /** カードに出す推薦理由 */
  reasons: string[];
  /** 滞在時間ぶんの概算料金（円）。算出できなければ null */
  estimatedFeeJpy: number | null;
  /** 概算料金が最大料金で頭打ちになったか */
  feeCapped: boolean;
  /** 評価時点で営業中かどうか */
  openState: OpenState;
  /** 滞在時間が最大駐車時間を超えているか */
  exceedsMaxStay: boolean;
  /**
   * 登録情報の充実度（0〜1）。
   * OSM には名前も台数も料金も無い曖昧な点が多く、そういうものが
   * 「近い」というだけで上位に来ないよう、総合点に掛けて効かせる。
   */
  confidence: number;
  /** 注意して扱うべき理由。「情報が少ない」など */
  cautions: string[];
};

/** レコメンドの絞り込み条件 */
export type ParkingFilters = {
  /** 目的地からの許容徒歩距離(m) */
  maxWalkM: number;
  /** 無料の駐車場だけに絞る */
  freeOnly: boolean;
  /** 屋根ありだけに絞る */
  coveredOnly: boolean;
  /** 車高(m)。指定すると制限に引っかかる駐車場を除外 */
  vehicleHeightM: number | null;
  /** 予定している滞在時間(分)。料金の見積もりに使う */
  stayMinutes: number;
  /** 今すぐ停められる（営業中の）駐車場だけに絞る */
  openNowOnly: boolean;
  /** 登録情報が薄い駐車場を候補から外す */
  reliableOnly: boolean;
};

export const DEFAULT_FILTERS: ParkingFilters = {
  maxWalkM: 500,
  freeOnly: false,
  coveredOnly: false,
  vehicleHeightM: null,
  stayMinutes: 120,
  openNowOnly: false,
  reliableOnly: false,
};
