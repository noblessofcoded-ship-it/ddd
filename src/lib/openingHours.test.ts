import { describe, expect, it } from 'vitest';
import { evaluateOpeningHours } from './openingHours';

/** 2026-08-31 は月曜日 */
const monday = (hour: number, minute = 0) => new Date(2026, 7, 31, hour, minute);
/** 2026-09-05 は土曜日 */
const saturday = (hour: number, minute = 0) => new Date(2026, 8, 5, hour, minute);
/** 2026-09-06 は日曜日 */
const sunday = (hour: number, minute = 0) => new Date(2026, 8, 6, hour, minute);

describe('evaluateOpeningHours', () => {
  it('24/7 は常に営業中', () => {
    expect(evaluateOpeningHours('24/7', monday(3))).toBe('open');
    expect(evaluateOpeningHours('24/7', sunday(23, 59))).toBe('open');
  });

  it('曜日指定なしの時間帯を判定する', () => {
    expect(evaluateOpeningHours('08:00-20:00', monday(12))).toBe('open');
    expect(evaluateOpeningHours('08:00-20:00', monday(7, 59))).toBe('closed');
    expect(evaluateOpeningHours('08:00-20:00', monday(20))).toBe('closed');
  });

  it('開始時刻ちょうどは営業中、終了時刻ちょうどは営業終了とみなす', () => {
    expect(evaluateOpeningHours('08:00-20:00', monday(8))).toBe('open');
    expect(evaluateOpeningHours('08:00-20:00', monday(19, 59))).toBe('open');
  });

  it('曜日レンジを解釈する', () => {
    expect(evaluateOpeningHours('Mo-Fr 09:00-18:00', monday(10))).toBe('open');
    expect(evaluateOpeningHours('Mo-Fr 09:00-18:00', saturday(10))).toBe('closed');
  });

  it('複数の規則を順に適用し、後ろの規則を優先する', () => {
    const hours = 'Mo-Fr 09:00-18:00; Sa 10:00-16:00; Su off';
    expect(evaluateOpeningHours(hours, monday(10))).toBe('open');
    expect(evaluateOpeningHours(hours, saturday(11))).toBe('open');
    expect(evaluateOpeningHours(hours, saturday(17))).toBe('closed');
    expect(evaluateOpeningHours(hours, sunday(11))).toBe('closed');
  });

  it('日跨ぎの時間帯を扱う', () => {
    expect(evaluateOpeningHours('22:00-06:00', monday(23))).toBe('open');
    expect(evaluateOpeningHours('22:00-06:00', monday(2))).toBe('open');
    expect(evaluateOpeningHours('22:00-06:00', monday(12))).toBe('closed');
  });

  it('前日から日跨ぎで営業している場合を拾う', () => {
    // 土曜 22:00-02:00 の営業は、日曜 01:00 時点でも営業中
    expect(evaluateOpeningHours('Sa 22:00-02:00', sunday(1))).toBe('open');
    expect(evaluateOpeningHours('Sa 22:00-02:00', sunday(3))).toBe('closed');
  });

  it('1日に複数の時間帯があるケース（昼休みなど）', () => {
    const hours = 'Mo-Fr 09:00-12:00,13:00-18:00';
    expect(evaluateOpeningHours(hours, monday(10))).toBe('open');
    expect(evaluateOpeningHours(hours, monday(12, 30))).toBe('closed');
    expect(evaluateOpeningHours(hours, monday(15))).toBe('open');
  });

  it('読めない書式は unknown にして候補から落とさない', () => {
    expect(evaluateOpeningHours('Mo-Fr 09:00-18:00; PH off', monday(10))).toBe('unknown');
    expect(evaluateOpeningHours('sunrise-sunset', monday(10))).toBe('unknown');
    expect(evaluateOpeningHours('営業時間は店舗に準ずる', monday(10))).toBe('unknown');
    expect(evaluateOpeningHours('Mo-Fr 09:00+', monday(10))).toBe('unknown');
    expect(evaluateOpeningHours(null, monday(10))).toBe('unknown');
    expect(evaluateOpeningHours('', monday(10))).toBe('unknown');
  });

  it('全日休みの指定を読む', () => {
    expect(evaluateOpeningHours('off', monday(10))).toBe('closed');
  });
});
