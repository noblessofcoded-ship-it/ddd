import { describe, expect, it } from 'vitest';
import { areaKeyword, buildFeeSearchQuery, buildFeeSearchUrl } from './webSearch';
import { EMPTY_FEE } from './fee';
import type { ParkingLot } from '../types';

function lot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'node/1',
    name: 'タイムズ宗右衛門町',
    named: true,
    access: 'public',
    operator: null,
    lat: 34.669,
    lng: 135.502,
    fee: 'unknown',
    feeNote: null,
    feeSource: 'osm',
    parsedFee: EMPTY_FEE,
    kind: 'surface',
    capacity: null,
    openingHours: null,
    maxStayMinutes: null,
    maxHeightM: null,
    distanceM: 100,
    walkMinutes: 2,
    ...overrides,
  };
}

const AREA = '大阪府 大阪市 中央区 宗右衛門町';

describe('areaKeyword', () => {
  it('狭い方の地名を 2 つだけ取る', () => {
    expect(areaKeyword(AREA)).toBe('中央区 宗右衛門町');
  });

  it('区切り文字のゆれを吸収する', () => {
    expect(areaKeyword('大阪府, 大阪市, 中央区, 宗右衛門町')).toBe('中央区 宗右衛門町');
    expect(areaKeyword('大阪府、大阪市、中央区')).toBe('大阪市 中央区');
  });

  it('短い住所はそのまま', () => {
    expect(areaKeyword('宗右衛門町')).toBe('宗右衛門町');
  });

  it('空なら空', () => {
    expect(areaKeyword(null)).toBe('');
    expect(areaKeyword('')).toBe('');
    expect(areaKeyword('   ')).toBe('');
  });
});

describe('buildFeeSearchQuery', () => {
  it('名前がある駐車場は名前で引く', () => {
    expect(buildFeeSearchQuery(lot(), AREA)).toBe('タイムズ宗右衛門町 中央区 駐車場 料金');
  });

  it('名前に地名が入っていればそのぶんは足さない', () => {
    // 「宗右衛門町」が名前に含まれるので、地域語からは落ちる
    expect(buildFeeSearchQuery(lot({ name: 'タイムズ宗右衛門町' }), '宗右衛門町')).toBe(
      'タイムズ宗右衛門町 駐車場 料金',
    );
  });

  it('運営者が名前に含まれていなければ足す', () => {
    expect(buildFeeSearchQuery(lot({ name: '第3パーキング', operator: '三井のリパーク' }), null))
      .toBe('第3パーキング 三井のリパーク 駐車場 料金');
  });

  it('運営者が名前に含まれていれば足さない', () => {
    expect(buildFeeSearchQuery(lot({ name: 'タイムズ心斎橋', operator: 'タイムズ' }), null))
      .toBe('タイムズ心斎橋 駐車場 料金');
  });

  it('名前が無い駐車場は地名で「その辺りの料金」を探す', () => {
    expect(buildFeeSearchQuery(lot({ named: false, name: '駐車場（名称なし）' }), AREA))
      .toBe('中央区 宗右衛門町 駐車場 料金');
  });

  it('名前も地名も無ければ、最低限の語だけにする', () => {
    expect(buildFeeSearchQuery(lot({ named: false, name: '駐車場（名称なし）' }), null))
      .toBe('駐車場 料金');
  });

  it('語の重複を避ける', () => {
    expect(buildFeeSearchQuery(lot({ name: '駐車場' }), null)).toBe('駐車場 料金');
  });
});

describe('buildFeeSearchUrl', () => {
  it('検索ページの URL を組み立てる', () => {
    const url = new URL(buildFeeSearchUrl(lot(), AREA));
    expect(url.origin + url.pathname).toBe('https://www.google.com/search');
    expect(url.searchParams.get('q')).toBe('タイムズ宗右衛門町 中央区 駐車場 料金');
  });
});
