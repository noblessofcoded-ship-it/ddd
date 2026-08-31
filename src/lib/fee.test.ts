import { describe, expect, it } from 'vitest';
import {
  estimateFee,
  formatDuration,
  formatJpy,
  parseCharge,
  parseMaxStay,
  type ParsedFee,
} from './fee';

describe('parseCharge — 単価', () => {
  it('「300円/30分」を読む', () => {
    expect(parseCharge('300円/30分').rate).toEqual({ unitJpy: 300, unitMinutes: 30 });
  });

  it('全角円マーク・空白ゆれを吸収する', () => {
    expect(parseCharge('￥300 ／ 30分').rate).toEqual({ unitJpy: 300, unitMinutes: 30 });
    expect(parseCharge('¥ 400/1時間').rate).toEqual({ unitJpy: 400, unitMinutes: 60 });
  });

  it('英語表記も読む', () => {
    expect(parseCharge('300 JPY/30 min').rate).toEqual({ unitJpy: 300, unitMinutes: 30 });
    expect(parseCharge('500 JPY per 1 hour').rate).toEqual({ unitJpy: 500, unitMinutes: 60 });
  });

  it('時間が先に来る「1時間400円」を読む', () => {
    expect(parseCharge('1時間400円').rate).toEqual({ unitJpy: 400, unitMinutes: 60 });
    expect(parseCharge('30分 200円').rate).toEqual({ unitJpy: 200, unitMinutes: 30 });
  });

  it('3桁区切りのカンマを外す', () => {
    expect(parseCharge('1,200円/60分').rate).toEqual({ unitJpy: 1200, unitMinutes: 60 });
  });

  it('読めない文字列では null', () => {
    expect(parseCharge('要問い合わせ').rate).toBeNull();
    expect(parseCharge('').rate).toBeNull();
    expect(parseCharge(null).rate).toBeNull();
    expect(parseCharge(undefined).rate).toBeNull();
  });

  it('0 分単位のような壊れた入力を弾く', () => {
    expect(parseCharge('300円/0分').rate).toBeNull();
  });
});

describe('parseCharge — 最大料金', () => {
  it('「最大1,000円」を読む', () => {
    expect(parseCharge('300円/30分 最大1,000円').maxJpy).toBe(1000);
  });

  it('「上限」「打ち切り」も読む', () => {
    expect(parseCharge('上限 800円').maxJpy).toBe(800);
    expect(parseCharge('200円/20分 打ち切り 1500円').maxJpy).toBe(1500);
  });

  it('24時間最大の書式を読む', () => {
    const parsed = parseCharge('400円/60分 24時間最大2000円');
    expect(parsed.rate).toEqual({ unitJpy: 400, unitMinutes: 60 });
    expect(parsed.maxJpy).toBe(2000);
  });

  it('最大料金だけの記載では単価を推測しない', () => {
    const parsed = parseCharge('最大料金 1000円');
    expect(parsed.maxJpy).toBe(1000);
    expect(parsed.rate).toBeNull();
  });
});

describe('estimateFee', () => {
  const rate = (unitJpy: number, unitMinutes: number, maxJpy: number | null = null): ParsedFee => ({
    rate: { unitJpy, unitMinutes },
    maxJpy,
  });

  it('単位時間ごとに切り上げて課金する', () => {
    expect(estimateFee(rate(300, 30), 60)?.jpy).toBe(600);
    expect(estimateFee(rate(300, 30), 61)?.jpy).toBe(900);
    expect(estimateFee(rate(300, 30), 1)?.jpy).toBe(300);
  });

  it('最大料金で頭打ちにする', () => {
    const result = estimateFee(rate(300, 30, 1000), 480);
    expect(result).toEqual({ jpy: 1000, capped: true });
  });

  it('最大料金に達しなければ頭打ちにしない', () => {
    expect(estimateFee(rate(300, 30, 1000), 60)).toEqual({ jpy: 600, capped: false });
  });

  it('単価不明でも最大料金があれば上限額を返す', () => {
    expect(estimateFee({ rate: null, maxJpy: 1000 }, 120)).toEqual({ jpy: 1000, capped: true });
  });

  it('何も分からなければ null', () => {
    expect(estimateFee({ rate: null, maxJpy: null }, 120)).toBeNull();
  });

  it('滞在時間が 0 以下なら null', () => {
    expect(estimateFee(rate(300, 30), 0)).toBeNull();
  });
});

describe('parseMaxStay', () => {
  it('時間・分を分に揃える', () => {
    expect(parseMaxStay('2 h')).toBe(120);
    expect(parseMaxStay('90 min')).toBe(90);
    expect(parseMaxStay('3時間')).toBe(180);
  });

  it('無制限や不明は null', () => {
    expect(parseMaxStay('unlimited')).toBeNull();
    expect(parseMaxStay('no')).toBeNull();
    expect(parseMaxStay(null)).toBeNull();
    expect(parseMaxStay('たまに制限あり')).toBeNull();
  });
});

describe('表示フォーマット', () => {
  it('金額を3桁区切りにする', () => {
    expect(formatJpy(1200)).toBe('1,200円');
    expect(formatJpy(300)).toBe('300円');
  });

  it('滞在時間を読みやすくする', () => {
    expect(formatDuration(30)).toBe('30分');
    expect(formatDuration(120)).toBe('2時間');
    expect(formatDuration(90)).toBe('1時間30分');
  });
});
