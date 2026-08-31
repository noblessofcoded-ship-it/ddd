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
  fee: FeeKind;
  /** 料金の説明文（`fee:conditions` や `charge` タグ） */
  feeNote: string | null;
  kind: ParkingKind;
  /** 収容台数。不明なら null */
  capacity: number | null;
  /** 営業時間の生文字列（例: "24/7"） */
  openingHours: string | null;
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
};

export const DEFAULT_FILTERS: ParkingFilters = {
  maxWalkM: 500,
  freeOnly: false,
  coveredOnly: false,
  vehicleHeightM: null,
};
