import { describe, expect, it } from 'vitest';
import { combine, mergeParking, namesLookSame } from './mergeParking';
import { EMPTY_FEE } from './fee';
import type { ParkingLot } from '../types';

function lot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'node/1',
    source: 'osm',
    enrichedBy: null,
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
    const { lots, combined } = mergeParking([lot()], [yahooLot()]);
    expect(lots).toHaveLength(1);
    expect(lots[0].name).toBe('タイムズ天満第2');
    expect(lots[0].capacity).toBe(20);
    expect(combined).toBe(1);
  });

  it('離れていれば別の駐車場として残す', () => {
    expect(mergeParking([lot()], [yahooLot({ lat: 34.7105 })]).lots).toHaveLength(2);
  });

  it('名前が矛盾すれば別の駐車場として残す', () => {
    const { lots } = mergeParking([lot({ named: true })], [yahooLot({ name: '三井のリパーク天満' })]);
    expect(lots).toHaveLength(2);
  });

  it('OSM に無い駐車場を足す', () => {
    const { lots, addedFromYahoo } = mergeParking([], [yahooLot()]);
    expect(lots.map((l) => l.source)).toEqual(['yahoo']);
    expect(addedFromYahoo).toBe(1);
  });

  it('1 つの Yahoo! の駐車場を 2 件に使い回さない', () => {
    const { lots } = mergeParking([lot({ id: 'node/1' }), lot({ id: 'node/2' })], [yahooLot()]);
    expect(lots).toHaveLength(2);
    expect(lots.filter((l) => l.name === 'タイムズ天満第2')).toHaveLength(1);
  });

  it('Yahoo! が空でも OSM の結果はそのまま', () => {
    const { lots, combined, addedFromYahoo } = mergeParking([lot()], []);
    expect(lots).toHaveLength(1);
    expect(combined).toBe(0);
    expect(addedFromYahoo).toBe(0);
  });
});

describe('mergeParking — 名前が手がかりにならない駐車場', () => {
  /** OSM に「駐車場（名称なし）」としてしか無い駐車場 */
  const anonymous = (overrides: Partial<ParkingLot> = {}) =>
    lot({ name: '駐車場（名称なし）', named: false, operator: null, ...overrides });

  it('名前が違っても、すぐ近くなら同じ駐車場として合成する', () => {
    // 名前で裏が取れないことを理由に別物と決めつけると、
    // 同じ駐車場が二重に並び、名前も付かないままになる
    const { lots, combined } = mergeParking([anonymous()], [yahooLot({ name: 'カーピット天満' })]);
    expect(lots).toHaveLength(1);
    expect(lots[0].name).toBe('カーピット天満');
    expect(lots[0].capacity).toBe(20);
    expect(combined).toBe(1);
  });

  it('名前が手がかりにならない場合は距離を厳しく見る', () => {
    // 50m 離れていれば、別の駐車場を巻き込まないよう合成しない
    const far = yahooLot({ name: 'カーピット天満', lat: 34.7055 + 0.00045 });
    expect(mergeParking([anonymous()], [far]).lots).toHaveLength(2);
  });

  it('名前で裏が取れる場合は少し離れていても合成する', () => {
    // OSM は区画の中心、Yahoo! は出入口付近を指していることがある
    const far = yahooLot({ lat: 34.7055 + 0.00045 });
    expect(mergeParking([lot()], [far]).lots).toHaveLength(1);
  });
});

describe('namesLookSame — 屋号の表記ゆれ', () => {
  it('屋号末尾の数字を無視する', () => {
    // 「タイムズ24」は法人名で、個々の駐車場名には現れない
    expect(namesLookSame('タイムズ24', 'タイムズ天満橋筋')).toBe(true);
    expect(namesLookSame('リパーク123', 'リパーク天満')).toBe(true);
  });

  it('無関係な名前は数字を外しても別物のまま', () => {
    expect(namesLookSame('タイムズ24', '三井のリパーク天満')).toBe(false);
  });
});

describe('mergeParking — 運営者名での突き合わせ', () => {
  it('名前が運営者名でも、Yahoo! の固有名に置き換える', () => {
    const osm = lot({ name: 'タイムズ24', named: true, operator: 'タイムズ24' });
    const { lots } = mergeParking([osm], [yahooLot({ name: 'タイムズ天満橋筋' })]);
    expect(lots).toHaveLength(1);
    expect(lots[0].name).toBe('タイムズ天満橋筋');
    expect(lots[0].capacity).toBe(20);
  });

  it('名前と運営者が食い違っていても、どちらかで一致すれば突き合わせる', () => {
    const osm = lot({ name: '第2駐車場', named: true, operator: 'タイムズ' });
    const { lots } = mergeParking([osm], [yahooLot({ name: 'タイムズ天満橋筋' })]);
    expect(lots).toHaveLength(1);
    // 固有名がある側は残す
    expect(lots[0].name).toBe('第2駐車場');
    expect(lots[0].address).toBe('大阪府大阪市北区天満2-5');
  });

  it('補ったことを記録する', () => {
    const { lots } = mergeParking([lot()], [yahooLot()]);
    expect(lots[0].enrichedBy).toBe('yahoo');
  });

  it('突き合わなかった駐車場には印を付けない', () => {
    const { lots } = mergeParking([lot()], []);
    expect(lots[0].enrichedBy).toBeNull();
  });
});
