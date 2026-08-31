import { describe, expect, it } from 'vitest';
import { areaKeywords, buildFeeSearchQuery, buildFeeSearchUrl } from './webSearch';
import { EMPTY_FEE } from './fee';
import type { ParkingLot } from '../types';

function lot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'node/1',
    name: 'タイムズ宗右衛門町',
    source: 'osm',
    named: true,
    address: null,
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
    maxWidthM: null,
    maxLengthM: null,
    surface: null,
    distanceM: 100,
    walkMinutes: 2,
    ...overrides,
  };
}

const DESTINATION_AREA = '大阪府 大阪市 中央区 宗右衛門町';

describe('areaKeywords', () => {
  it('狭い地名から指定数だけ取る', () => {
    expect(areaKeywords(DESTINATION_AREA, 2)).toEqual(['中央区', '宗右衛門町']);
    expect(areaKeywords(DESTINATION_AREA, 4)).toEqual(['大阪府', '大阪市', '中央区', '宗右衛門町']);
  });

  it('区切り文字のゆれを吸収する', () => {
    expect(areaKeywords('大阪府, 大阪市, 中央区', 2)).toEqual(['大阪市', '中央区']);
  });

  it('空なら空', () => {
    expect(areaKeywords(null, 2)).toEqual([]);
    expect(areaKeywords('   ', 2)).toEqual([]);
  });
});

describe('buildFeeSearchQuery — 固有名があるとき', () => {
  it('名前を主語にして地名を添える', () => {
    expect(buildFeeSearchQuery(lot({ name: '第3パーキング' }), DESTINATION_AREA)).toBe(
      '第3パーキング 中央区 宗右衛門町 駐車場 料金',
    );
  });

  it('名前に含まれる地名は重ねない', () => {
    expect(buildFeeSearchQuery(lot(), DESTINATION_AREA)).toBe(
      'タイムズ宗右衛門町 中央区 駐車場 料金',
    );
  });

  it('運営者が名前に含まれていなければ足す', () => {
    expect(buildFeeSearchQuery(lot({ name: '第3パーキング', operator: '三井のリパーク' }), null))
      .toBe('第3パーキング 三井のリパーク 駐車場 料金');
  });
});

describe('buildFeeSearchQuery — 運営者名しか分からないとき', () => {
  /** name タグが無く operator=タイムズ だけの駐車場 */
  const timesOnly = (overrides: Partial<ParkingLot> = {}) =>
    lot({ name: 'タイムズ', named: false, operator: 'タイムズ', ...overrides });

  it('「タイムズ」だけで終わらせず、地名を厚く足す', () => {
    const query = buildFeeSearchQuery(timesOnly(), DESTINATION_AREA);
    expect(query).toBe('タイムズ 大阪府 大阪市 中央区 宗右衛門町 駐車場 料金');
  });

  it('駐車場自身の住所があれば、目的地の住所より優先する', () => {
    const query = buildFeeSearchQuery(
      timesOnly({ address: '大阪府 大阪市 中央区 東心斎橋 1-2' }),
      DESTINATION_AREA,
    );
    expect(query).toContain('東心斎橋');
    expect(query).not.toContain('宗右衛門町');
  });

  it('固有名があるときより地名を多く足す', () => {
    const withName = buildFeeSearchQuery(lot({ name: '第3パーキング' }), DESTINATION_AREA);
    const withoutName = buildFeeSearchQuery(timesOnly(), DESTINATION_AREA);
    expect(withoutName.split(' ').length).toBeGreaterThan(withName.split(' ').length);
  });
});

describe('buildFeeSearchQuery — 名前も運営者も無いとき', () => {
  const anonymous = (overrides: Partial<ParkingLot> = {}) =>
    lot({ name: '駐車場（名称なし）', named: false, operator: null, ...overrides });

  it('地名だけで「その辺りの駐車場料金」を探す', () => {
    expect(buildFeeSearchQuery(anonymous(), DESTINATION_AREA)).toBe(
      '大阪府 大阪市 中央区 宗右衛門町 駐車場 料金',
    );
  });

  it('既定の文言を検索語に混ぜない', () => {
    expect(buildFeeSearchQuery(anonymous(), DESTINATION_AREA)).not.toContain('名称なし');
  });

  it('地名も無ければ最低限の語だけにする', () => {
    expect(buildFeeSearchQuery(anonymous(), null)).toBe('駐車場 料金');
  });
});

describe('buildFeeSearchUrl', () => {
  it('検索ページの URL を組み立てる', () => {
    const url = new URL(buildFeeSearchUrl(lot({ name: '第3パーキング' }), DESTINATION_AREA));
    expect(url.origin + url.pathname).toBe('https://www.google.com/search');
    expect(url.searchParams.get('q')).toBe('第3パーキング 中央区 宗右衛門町 駐車場 料金');
  });
});
