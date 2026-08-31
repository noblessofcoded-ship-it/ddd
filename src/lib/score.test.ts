import { describe, expect, it } from 'vitest';
import { matchesFilters, rankParking, scoreParking } from './score';
import { DEFAULT_FILTERS, type ParkingLot } from '../types';

function lot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'node/1',
    name: 'テスト駐車場',
    lat: 35.68,
    lng: 139.76,
    fee: 'unknown',
    feeNote: null,
    kind: 'surface',
    capacity: null,
    openingHours: null,
    maxHeightM: null,
    distanceM: 200,
    walkMinutes: 4,
    ...overrides,
  };
}

describe('scoreParking', () => {
  it('近いほど高くなる', () => {
    const near = scoreParking(lot({ distanceM: 100 }), DEFAULT_FILTERS);
    const far = scoreParking(lot({ distanceM: 900 }), DEFAULT_FILTERS);
    expect(near).toBeGreaterThan(far);
  });

  it('無料は有料より高くなる', () => {
    const free = scoreParking(lot({ fee: 'free' }), DEFAULT_FILTERS);
    const paid = scoreParking(lot({ fee: 'paid' }), DEFAULT_FILTERS);
    expect(free).toBeGreaterThan(paid);
  });

  it('料金不明は有料より下に置く', () => {
    expect(scoreParking(lot({ fee: 'unknown' }), DEFAULT_FILTERS)).toBeLessThan(
      scoreParking(lot({ fee: 'paid' }), DEFAULT_FILTERS),
    );
  });

  it('収容台数は 100 台で頭打ちにする', () => {
    const hundred = scoreParking(lot({ capacity: 100 }), DEFAULT_FILTERS);
    const thousand = scoreParking(lot({ capacity: 1000 }), DEFAULT_FILTERS);
    expect(thousand).toBe(hundred);
  });

  it('屋根あり・24時間は加点される', () => {
    const plain = scoreParking(lot(), DEFAULT_FILTERS);
    const comfy = scoreParking(lot({ kind: 'multi-storey', openingHours: '24/7' }), DEFAULT_FILTERS);
    expect(comfy).toBeGreaterThan(plain);
  });

  it('0-100 に収まる', () => {
    const best = scoreParking(
      lot({ distanceM: 0, fee: 'free', capacity: 500, kind: 'underground', openingHours: '24/7' }),
      DEFAULT_FILTERS,
    );
    const worst = scoreParking(lot({ distanceM: 5000, fee: 'paid' }), DEFAULT_FILTERS);
    expect(best).toBeLessThanOrEqual(100);
    expect(worst).toBeGreaterThanOrEqual(0);
  });
});

describe('matchesFilters', () => {
  it('徒歩許容距離を超えたら落とす', () => {
    expect(matchesFilters(lot({ distanceM: 900 }), DEFAULT_FILTERS)).toBe(false);
  });

  it('無料のみ指定では料金不明も落とす', () => {
    const filters = { ...DEFAULT_FILTERS, freeOnly: true };
    expect(matchesFilters(lot({ fee: 'free' }), filters)).toBe(true);
    expect(matchesFilters(lot({ fee: 'unknown' }), filters)).toBe(false);
  });

  it('屋根ありのみ指定では平面駐車場を落とす', () => {
    const filters = { ...DEFAULT_FILTERS, coveredOnly: true };
    expect(matchesFilters(lot({ kind: 'multi-storey' }), filters)).toBe(true);
    expect(matchesFilters(lot({ kind: 'surface' }), filters)).toBe(false);
  });

  it('車高制限に引っかかるものだけ落とす（制限不明は残す）', () => {
    const filters = { ...DEFAULT_FILTERS, vehicleHeightM: 2.1 };
    expect(matchesFilters(lot({ maxHeightM: 1.8 }), filters)).toBe(false);
    expect(matchesFilters(lot({ maxHeightM: 2.5 }), filters)).toBe(true);
    expect(matchesFilters(lot({ maxHeightM: null }), filters)).toBe(true);
  });
});

describe('rankParking', () => {
  it('スコア順に並べ、条件外を除く', () => {
    const ranked = rankParking(
      [
        lot({ id: 'node/1', distanceM: 450, fee: 'paid' }),
        lot({ id: 'node/2', distanceM: 120, fee: 'free' }),
        lot({ id: 'node/3', distanceM: 2000, fee: 'free' }),
      ],
      DEFAULT_FILTERS,
    );

    expect(ranked.map((item) => item.id)).toEqual(['node/2', 'node/1']);
  });

  it('同点なら近い方を先に出す', () => {
    const ranked = rankParking(
      [lot({ id: 'node/b', distanceM: 300 }), lot({ id: 'node/a', distanceM: 300 })],
      DEFAULT_FILTERS,
    );
    // 完全同点なので id で安定化されている
    expect(ranked.map((item) => item.id)).toEqual(['node/a', 'node/b']);
  });

  it('推薦理由が付く', () => {
    const [first] = rankParking([lot({ distanceM: 100, walkMinutes: 2, fee: 'free' })], DEFAULT_FILTERS);
    expect(first.reasons).toContain('目的地まで徒歩2分');
    expect(first.reasons).toContain('無料');
  });

  it('limit で件数を絞る', () => {
    const lots = Array.from({ length: 20 }, (_, index) =>
      lot({ id: `node/${index}`, distanceM: 100 + index }),
    );
    expect(rankParking(lots, DEFAULT_FILTERS, 5)).toHaveLength(5);
  });
});
