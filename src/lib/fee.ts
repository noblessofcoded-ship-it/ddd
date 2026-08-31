/** 「300円/30分」のような時間単価 */
export type ParkingRate = {
  /** 単位時間あたりの料金（円） */
  unitJpy: number;
  /** 単位時間（分） */
  unitMinutes: number;
};

/** OSM の charge / fee:conditions から読み取れた料金体系 */
export type ParsedFee = {
  rate: ParkingRate | null;
  /** 打ち切り最大料金（円）。「最大1,000円」など */
  maxJpy: number | null;
};

export type FeeEstimate = {
  /** 概算料金（円） */
  jpy: number;
  /** 最大料金で頭打ちになったか */
  capped: boolean;
};

export const EMPTY_FEE: ParsedFee = { rate: null, maxJpy: null };

/** 金額の表記ゆれ。¥ / ￥ / 円 / JPY に対応し、3桁区切りのカンマを許す */
const AMOUNT = String.raw`[¥￥]?\s*([\d,]+)\s*(?:円|圓|JPY|yen)?`;
/** 時間の表記ゆれ。分 / 時間 / min / h に対応 */
const DURATION = String.raw`(\d+)\s*(分間|分|時間|minutes?|mins?|hours?|min|hr?)`;

function toMinutes(value: number, unit: string): number {
  const normalized = unit.toLowerCase();
  const isHour = normalized === '時間' || normalized.startsWith('h');
  return isHour ? value * 60 : value;
}

/** 「毎」「ごと」など、単価であることを示す語 */
const PER_MARKER = String.raw`(?:/|／|per|につき|ごとに?|毎)`;

function toJpy(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

/**
 * 料金文字列から単価と最大料金を読み取る。
 * 対応する主な書式:
 *   「300円/30分」「￥300 / 30分」「300 JPY/30 min」
 *   「1時間 400円」「30分200円」
 *   「最大料金 1,000円」「24時間最大1000円」
 * 読み取れなかった部分は null のままにして、呼び出し側で「不明」として扱う。
 */
export function parseCharge(raw: string | null | undefined): ParsedFee {
  if (!raw) return EMPTY_FEE;
  const text = raw.trim();
  if (text.length === 0) return EMPTY_FEE;

  return { rate: parseRate(text), maxJpy: parseMaxJpy(text) };
}

function parseRate(text: string): ParkingRate | null {
  // 「300円/30分」— 金額が先、スラッシュ区切り
  const perUnit = text.match(new RegExp(`${AMOUNT}\\s*${PER_MARKER}\\s*${DURATION}`, 'i'));
  if (perUnit) {
    return buildRate(toJpy(perUnit[1]), Number(perUnit[2]), perUnit[3]);
  }

  // 「30分ごとに200円」「20分毎 100円」— 時間が先で「ごと/毎」を挟む
  const perFirst = text.match(new RegExp(`${DURATION}\\s*${PER_MARKER}\\s*${AMOUNT}`, 'i'));
  if (perFirst) {
    return buildRate(toJpy(perFirst[3]), Number(perFirst[1]), perFirst[2]);
  }

  // 「1時間 400円」— 時間が先。最大料金の記述を単価と読み違えないよう除外する
  const unitFirst = text.match(new RegExp(`(?<!最大[^\\d]{0,10})${DURATION}\\s*(?:で|は|:|：)?\\s*${AMOUNT}`, 'i'));
  if (unitFirst && !/最大/.test(text.slice(0, unitFirst.index ?? 0).slice(-12))) {
    return buildRate(toJpy(unitFirst[3]), Number(unitFirst[1]), unitFirst[2]);
  }

  return null;
}

function buildRate(unitJpy: number, value: number, unit: string): ParkingRate | null {
  const unitMinutes = toMinutes(value, unit);
  if (!Number.isFinite(unitJpy) || unitJpy < 0) return null;
  if (!Number.isFinite(unitMinutes) || unitMinutes <= 0) return null;
  return { unitJpy, unitMinutes };
}

function parseMaxJpy(text: string): number | null {
  // 「最大1,000円」「最大料金 1000円」「打ち切り 800円」
  const matched = text.match(new RegExp(`(?:最大|上限|打ち切り|打切)[^\\d]{0,10}${AMOUNT}`));
  if (!matched) return null;
  const value = toJpy(matched[1]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * 滞在時間ぶんの料金を見積もる。
 * 単価は切り上げ課金（30分単位なら 31 分でも 2 単位）として計算する。
 */
export function estimateFee(fee: ParsedFee, stayMinutes: number): FeeEstimate | null {
  if (stayMinutes <= 0) return null;

  if (fee.rate === null) {
    // 単価は不明でも最大料金だけ分かっているなら、その額を上限として示す
    return fee.maxJpy === null ? null : { jpy: fee.maxJpy, capped: true };
  }

  const units = Math.ceil(stayMinutes / fee.rate.unitMinutes);
  const jpy = units * fee.rate.unitJpy;

  if (fee.maxJpy !== null && jpy > fee.maxJpy) {
    return { jpy: fee.maxJpy, capped: true };
  }
  return { jpy, capped: false };
}

/** 「1,200円」のような表示用フォーマット */
export function formatJpy(jpy: number): string {
  return `${jpy.toLocaleString('ja-JP')}円`;
}

/** 「2時間」「30分」「1時間30分」のような表示用フォーマット */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

/** OSM の maxstay（"2 h" / "60 min"）を分にする */
export function parseMaxStay(raw: string | null | undefined): number | null {
  if (!raw) return null;
  if (/^\s*(unlimited|no)\s*$/i.test(raw)) return null;
  const matched = raw.match(new RegExp(`^\\s*${DURATION}\\s*$`, 'i'));
  if (!matched) return null;
  const minutes = toMinutes(Number(matched[1]), matched[2]);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}
