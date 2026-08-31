import { describe, expect, it } from 'vitest';
import { combine, mergeParking, namesLookSame } from './mergeParking';
import { EMPTY_FEE } from './fee';
import type { ParkingLot } from '../types';

function lot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'node/1',
    source: 'osm',
    name: 'タイムズ',
    named: false,
    address: null,
    access: 'public',
    operator: 'タイムズ',
    lat: 34.7055,
    lng: 135.5125,
    fee: 'paid',
    feeNote: '300円/30分',
    feeSource: 'osm',
    parsedFee: EMPTY_FEE,
    kind: 'surface',
    capacity: 20,
    openingHours: null,
    maxStayMinutes: null,
    maxHeightM: 2.1,
    maxWidthM: null,
    maxLengthM: null,
    surface: 'asphalt',
    distanceM: 100,
    walkMinutes: 2,
    ...overrides,
  };
}

const yahooLot = (overrides: Partial<ParkingLot> = {}) =>
  lot({
    id: 'yahoo:1',
    source: 'yahoo',
    name: 'タイムズ天満第2',
    named: true,
    address: '大阪府大阪市北区天満2-5',
    operator: null,
    fee: 'unknown',
    feeNote: null,
    kind: 'unknown',
    capacity: null,
    maxHeightM: null,
    surface: null,
    ...overrides,
  });

describe('namesLookSame', () => {
  it('片方がもう片方を含んでいれば同じとみなす', () => {
    expect(namesLookSame('タイムズ', 'タイムズ天満第2')).toBe(true);
    expect(namesLookSame('タイムズ天満第2', 'タイムズ')).toBe(true);
  });

  it('無関係な名前は別物', () => {
    expect(namesLookSame('タイムズ', '三井のリパーク')).toBe(false);
  });

  it('空白や記号の違いは無視する', () => {
    expect(namesLookSame('タイムズ 天満', 'タイムズ天満')).toBe(true);
    expect(namesLookSame('リパーク（天満）', 'リパーク天満')).toBe(true);
  });

  it('名前が無い側は突き合わせを妨げない', () => {
    expect(namesLookSame('', 'タイムズ天満第2')).toBe(true);
  });
});

describe('combine', () => {
  it('OSM の仕様を残しつつ、Yahoo! の名前と住所で補う', () => {
    const result = combine(lot(), yahooLot());
    expect(result.name).toBe('タイムズ天満第2');
    expect(result.address).toBe('大阪府大阪市北区天満2-5');
    // 料金・台数・制限は OSM 側にしかない
    expect(result.feeNote).toBe('300円/30分');
    expect(result.capacity).toBe(20);
    expect(result.maxHeightM).toBe(2.1);
  });

  it('OSM に固有名があればそちらを残す', () => {
    const result = combine(lot({ name: '天満パーキング', named: true }), yahooLot());
    expect(result.name).toBe('天満パーキング');
  });

  it('OSM に住所があればそちらを残す', () => {
    const result = combine(lot({ address: 'OSM の住所' }), yahooLot());
    expect(result.address).toBe('OSM の住所');
  });
});

describe('mergeParking', () => {
  it('近接していて名前が矛盾しなければ 1 件にまとめる', () => {
    const merged = mergeParking([lot()], [yahooLot()]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('タイムズ天満第2');
    expect(merged[0].capacity).toBe(20);
  });

  it('離れていれば別の駐車場として残す', () => {
    const merged = mergeParking([lot()], [yahooLot({ lat: 34.7105 })]);
    expect(merged).toHaveLength(2);
  });

  it('名前が矛盾すれば別の駐車場として残す', () => {
    const merged = mergeParking([lot()], [yahooLot({ name: '三井のリパーク天満' })]);
    expect(merged).toHaveLength(2);
  });

  it('OSM に無い駐車場を足す', () => {
    const merged = mergeParking([], [yahooLot()]);
    expect(merged.map((l) => l.source)).toEqual(['yahoo']);
  });

  it('1 つの Yahoo! の駐車場を 2 件に使い回さない', () => {
    const merged = mergeParking([lot({ id: 'node/1' }), lot({ id: 'node/2' })], [yahooLot()]);
    expect(merged).toHaveLength(2);
    expect(merged.filter((l) => l.name === 'タイムズ天満第2')).toHaveLength(1);
  });

  it('Yahoo! が空でも OSM の結果はそのまま', () => {
    expect(mergeParking([lot()], [])).toHaveLength(1);
  });
});
