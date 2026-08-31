import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyFeeNotes, loadFeeNotes, removeFeeNote, saveFeeNote, type FeeNotes } from './feeStore';
import { EMPTY_FEE } from './fee';
import type { ParkingLot } from '../types';

const KEY = 'parking-route:fee-notes:v1';

/** localStorage の代役。エラーを起こす版も作れるようにしておく */
function stubStorage(initial: Record<string, string> = {}, failing = false) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => {
      if (failing) throw new Error('denied');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (failing) throw new Error('denied');
      data.set(k, v);
    },
    removeItem: (k: string) => data.delete(k),
  });
  return data;
}

function lot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'node/1',
    name: 'テスト駐車場',
    named: true,
    access: 'public',
    operator: null,
    lat: 34.67,
    lng: 135.5,
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

describe('loadFeeNotes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('保存された料金メモを読む', () => {
    stubStorage({ [KEY]: JSON.stringify({ 'node/1': { charge: '300円/30分', updatedAt: 123 } }) });
    expect(loadFeeNotes()).toEqual({ 'node/1': { charge: '300円/30分', updatedAt: 123 } });
  });

  it('保存が無ければ空', () => {
    stubStorage();
    expect(loadFeeNotes()).toEqual({});
  });

  it('壊れた JSON でも落ちない', () => {
    stubStorage({ [KEY]: '{壊れている' });
    expect(loadFeeNotes()).toEqual({});
  });

  it('壊れた項目だけを捨てて、読める分は使う', () => {
    stubStorage({
      [KEY]: JSON.stringify({
        'node/1': { charge: '300円/30分', updatedAt: 1 },
        'node/2': { charge: '   ' },
        'node/3': 'こわれている',
      }),
    });
    expect(Object.keys(loadFeeNotes())).toEqual(['node/1']);
  });

  it('localStorage が使えなくても落ちない', () => {
    stubStorage({}, true);
    expect(loadFeeNotes()).toEqual({});
  });
});

describe('saveFeeNote / removeFeeNote', () => {
  beforeEach(() => stubStorage());
  afterEach(() => vi.unstubAllGlobals());

  it('登録して読み直せる', () => {
    const notes = saveFeeNote({}, 'node/1', '300円/30分');
    expect(notes['node/1'].charge).toBe('300円/30分');
    expect(loadFeeNotes()['node/1'].charge).toBe('300円/30分');
  });

  it('前後の空白を落とす', () => {
    expect(saveFeeNote({}, 'node/1', '  300円/30分 ')['node/1'].charge).toBe('300円/30分');
  });

  it('空文字を渡したら取り消しとして扱う', () => {
    const saved = saveFeeNote({}, 'node/1', '300円/30分');
    expect(saveFeeNote(saved, 'node/1', '   ')).toEqual({});
  });

  it('元のオブジェクトを書き換えない', () => {
    const before: FeeNotes = {};
    saveFeeNote(before, 'node/1', '300円/30分');
    expect(before).toEqual({});
  });

  it('保存できない環境でも、その場の値は返す', () => {
    vi.unstubAllGlobals();
    stubStorage({}, true);
    expect(saveFeeNote({}, 'node/1', '300円/30分')['node/1'].charge).toBe('300円/30分');
  });

  it('消せる', () => {
    const saved = saveFeeNote({}, 'node/1', '300円/30分');
    expect(removeFeeNote(saved, 'node/1')).toEqual({});
  });
});

describe('applyFeeNotes', () => {
  it('登録した料金を駐車場に反映する', () => {
    const [result] = applyFeeNotes([lot()], {
      'node/1': { charge: '300円/30分 最大1500円', updatedAt: 1 },
    });
    expect(result.fee).toBe('paid');
    expect(result.feeSource).toBe('user');
    expect(result.parsedFee.rate).toEqual({ unitJpy: 300, unitMinutes: 30 });
    expect(result.parsedFee.maxJpy).toBe(1500);
  });

  it('OSM に料金があっても、現地で見た方を優先する', () => {
    const osmLot = lot({ fee: 'paid', feeNote: '100円/60分', parsedFee: { rate: { unitJpy: 100, unitMinutes: 60 }, maxJpy: null } });
    const [result] = applyFeeNotes([osmLot], { 'node/1': { charge: '500円/30分', updatedAt: 1 } });
    expect(result.parsedFee.rate).toEqual({ unitJpy: 500, unitMinutes: 30 });
  });

  it('登録の無い駐車場はそのまま', () => {
    const original = lot({ id: 'node/9' });
    expect(applyFeeNotes([original], { 'node/1': { charge: '300円/30分', updatedAt: 1 } })[0])
      .toBe(original);
  });

  it('メモが空なら元の配列をそのまま返す', () => {
    const lots = [lot()];
    expect(applyFeeNotes(lots, {})).toBe(lots);
  });
});
