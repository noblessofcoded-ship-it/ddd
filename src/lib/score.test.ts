import { describe, expect, it } from 'vitest';
import { dataConfidence, matchesFilters, rankParking, scoreParking } from './score';
import { EMPTY_FEE, parseCharge } from './fee';
import { DEFAULT_FILTERS, type ParkingLot } from '../types';

/** 2026-08-31 12:00 は月曜の昼 */
const NOW = new Date(2026, 7, 31, 12, 0);

function lot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'node/1',
    name: 'テスト駐車場',
    lat: 35.68,
    lng: 139.76,
    named: true,
    access: 'public',
    operator: null,
    fee: 'unknown',
    feeNote: null,
    parsedFee: EMPTY_FEE,
    kind: 'surface',
    capacity: null,
    openingHours: null,
    maxStayMinutes: null,
    maxHeightM: null,
    distanceM: 200,
    walkMinutes: 4,
    ...overrides,
  };
}

/** 料金文字列つきの駐車場を作る */
function paidLot(charge: string, overrides: Partial<ParkingLot> = {}): ParkingLot {
  return lot({ fee: 'paid', feeNote: charge, parsedFee: parseCharge(charge), ...overrides });
}

const rank = (lots: ParkingLot[], filters = DEFAULT_FILTERS) =>
  rankParking(lots, filters, { now: NOW });

describe('scoreParking', () => {
  it('近いほど高くなる', () => {
    expect(scoreParking(lot({ distanceM: 100 }), DEFAULT_FILTERS, null)).toBeGreaterThan(
      scoreParking(lot({ distanceM: 900 }), DEFAULT_FILTERS, null),
    );
  });

  it('無料は有料より高くなる', () => {
    expect(scoreParking(lot({ fee: 'free' }), DEFAULT_FILTERS, null)).toBeGreaterThan(
      scoreParking(lot({ fee: 'paid' }), DEFAULT_FILTERS, null),
    );
  });

  it('概算料金が安いほど高くなる', () => {
    const cheap = scoreParking(lot({ fee: 'paid' }), DEFAULT_FILTERS, { jpy: 400, capped: false });
    const pricey = scoreParking(lot({ fee: 'paid' }), DEFAULT_FILTERS, { jpy: 1800, capped: false });
    expect(cheap).toBeGreaterThan(pricey);
  });

  it('額が分かる安い駐車場は、額が分からない有料駐車場より高くなる', () => {
    const known = scoreParking(lot({ fee: 'paid' }), DEFAULT_FILTERS, { jpy: 300, capped: false });
    const unknown = scoreParking(lot({ fee: 'paid' }), DEFAULT_FILTERS, null);
    expect(known).toBeGreaterThan(unknown);
  });

  it('料金不明は有料より下に置く', () => {
    expect(scoreParking(lot({ fee: 'unknown' }), DEFAULT_FILTERS, null)).toBeLessThan(
      scoreParking(lot({ fee: 'paid' }), DEFAULT_FILTERS, null),
    );
  });

  it('収容台数は 100 台で頭打ちにする', () => {
    expect(scoreParking(lot({ capacity: 1000 }), DEFAULT_FILTERS, null)).toBe(
      scoreParking(lot({ capacity: 100 }), DEFAULT_FILTERS, null),
    );
  });

  it('屋根あり・24時間は加点される', () => {
    expect(
      scoreParking(lot({ kind: 'multi-storey', openingHours: '24/7' }), DEFAULT_FILTERS, null),
    ).toBeGreaterThan(scoreParking(lot(), DEFAULT_FILTERS, null));
  });

  it('0-100 に収まる', () => {
    const best = scoreParking(
      lot({ distanceM: 0, fee: 'free', capacity: 500, kind: 'underground', openingHours: '24/7' }),
      DEFAULT_FILTERS,
      null,
    );
    const worst = scoreParking(lot({ distanceM: 5000, fee: 'paid' }), DEFAULT_FILTERS, {
      jpy: 5000,
      capped: false,
    });
    expect(best).toBeLessThanOrEqual(100);
    expect(worst).toBeGreaterThanOrEqual(0);
  });
});

describe('matchesFilters', () => {
  it('徒歩許容距離を超えたら落とす', () => {
    expect(matchesFilters(lot({ distanceM: 900 }), DEFAULT_FILTERS, 'unknown')).toBe(false);
  });

  it('無料のみ指定では料金不明も落とす', () => {
    const filters = { ...DEFAULT_FILTERS, freeOnly: true };
    expect(matchesFilters(lot({ fee: 'free' }), filters, 'unknown')).toBe(true);
    expect(matchesFilters(lot({ fee: 'unknown' }), filters, 'unknown')).toBe(false);
  });

  it('屋根ありのみ指定では平面駐車場を落とす', () => {
    const filters = { ...DEFAULT_FILTERS, coveredOnly: true };
    expect(matchesFilters(lot({ kind: 'multi-storey' }), filters, 'unknown')).toBe(true);
    expect(matchesFilters(lot({ kind: 'surface' }), filters, 'unknown')).toBe(false);
  });

  it('車高制限に引っかかるものだけ落とす（制限不明は残す）', () => {
    const filters = { ...DEFAULT_FILTERS, vehicleHeightM: 2.1 };
    expect(matchesFilters(lot({ maxHeightM: 1.8 }), filters, 'unknown')).toBe(false);
    expect(matchesFilters(lot({ maxHeightM: 2.5 }), filters, 'unknown')).toBe(true);
    expect(matchesFilters(lot({ maxHeightM: null }), filters, 'unknown')).toBe(true);
  });

  it('営業中のみ指定では、閉まっているものだけ落とす', () => {
    const filters = { ...DEFAULT_FILTERS, openNowOnly: true };
    expect(matchesFilters(lot(), filters, 'open')).toBe(true);
    expect(matchesFilters(lot(), filters, 'closed')).toBe(false);
    // 判定できない書式は多いので、unknown は残す
    expect(matchesFilters(lot(), filters, 'unknown')).toBe(true);
  });
});

describe('rankParking — 料金の見積もり', () => {
  it('滞在時間ぶんの概算料金を出す', () => {
    const [first] = rank([paidLot('300円/30分')]);
    expect(first.estimatedFeeJpy).toBe(1200); // 既定の滞在 2 時間 = 4 単位
    expect(first.feeCapped).toBe(false);
    expect(first.reasons).toContain('2時間で1,200円');
  });

  it('滞在時間を変えると料金も変わる', () => {
    const [short] = rank([paidLot('300円/30分')], { ...DEFAULT_FILTERS, stayMinutes: 60 });
    expect(short.estimatedFeeJpy).toBe(600);
    expect(short.reasons).toContain('1時間で600円');
  });

  it('最大料金で頭打ちになる', () => {
    const [first] = rank([paidLot('300円/30分 最大1,000円')], {
      ...DEFAULT_FILTERS,
      stayMinutes: 480,
    });
    expect(first.estimatedFeeJpy).toBe(1000);
    expect(first.feeCapped).toBe(true);
    expect(first.reasons).toContain('1,000円（最大料金）');
  });

  it('無料の駐車場は 0 円として扱う', () => {
    const [first] = rank([lot({ fee: 'free' })]);
    expect(first.estimatedFeeJpy).toBe(0);
    expect(first.reasons).toContain('無料');
  });

  it('料金を読めなければ null にして、生の文字列を理由に出す', () => {
    const [first] = rank([paidLot('料金は係員にお尋ねください')]);
    expect(first.estimatedFeeJpy).toBeNull();
    expect(first.reasons).toContain('料金は係員にお尋ねください');
  });

  it('安い方が上に来る', () => {
    const ranked = rank([
      paidLot('600円/30分', { id: 'node/expensive' }),
      paidLot('100円/30分', { id: 'node/cheap' }),
    ]);
    expect(ranked[0].id).toBe('node/cheap');
  });
});

describe('rankParking — 営業状態と最大駐車時間', () => {
  it('評価時刻に対する営業状態を付ける', () => {
    const ranked = rank([
      lot({ id: 'node/open', openingHours: '24/7' }),
      lot({ id: 'node/closed', openingHours: 'Mo-Fr 18:00-20:00' }),
      lot({ id: 'node/unknown', openingHours: null }),
    ]);
    const byId = Object.fromEntries(ranked.map((item) => [item.id, item.openState]));
    expect(byId['node/open']).toBe('open');
    expect(byId['node/closed']).toBe('closed');
    expect(byId['node/unknown']).toBe('unknown');
  });

  it('滞在時間が最大駐車時間を超えていたら印を付ける', () => {
    const ranked = rank([lot({ maxStayMinutes: 60 })], { ...DEFAULT_FILTERS, stayMinutes: 120 });
    expect(ranked[0].exceedsMaxStay).toBe(true);
  });

  it('最大駐車時間に収まっていれば印を付けない', () => {
    const ranked = rank([lot({ maxStayMinutes: 180 })], { ...DEFAULT_FILTERS, stayMinutes: 120 });
    expect(ranked[0].exceedsMaxStay).toBe(false);
  });
});

describe('rankParking — 並び順と絞り込み', () => {
  it('スコア順に並べ、条件外を除く', () => {
    const ranked = rank([
      lot({ id: 'node/1', distanceM: 450, fee: 'paid' }),
      lot({ id: 'node/2', distanceM: 120, fee: 'free' }),
      lot({ id: 'node/3', distanceM: 2000, fee: 'free' }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(['node/2', 'node/1']);
  });

  it('同点なら id で安定させる', () => {
    const ranked = rank([
      lot({ id: 'node/b', distanceM: 300 }),
      lot({ id: 'node/a', distanceM: 300 }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(['node/a', 'node/b']);
  });

  it('limit で件数を絞る', () => {
    const lots = Array.from({ length: 20 }, (_, index) =>
      lot({ id: `node/${index}`, distanceM: 100 + index }),
    );
    expect(rankParking(lots, DEFAULT_FILTERS, { now: NOW, limit: 5 })).toHaveLength(5);
  });
});

describe('dataConfidence', () => {
  it('情報が揃っているほど高い', () => {
    const rich = lot({ named: true, capacity: 50, fee: 'paid', kind: 'multi-storey', operator: 'タイムズ' });
    const bare = lot({ named: false, capacity: null, fee: 'unknown', kind: 'unknown', operator: null });
    expect(dataConfidence(rich)).toBe(1);
    expect(dataConfidence(bare)).toBe(0);
  });

  it('名前だけでも少しは加点される', () => {
    const named = lot({ named: true, capacity: null, fee: 'unknown', kind: 'unknown', operator: null });
    expect(dataConfidence(named)).toBeGreaterThan(0);
  });
});

describe('scoreParking — 情報の確かさによる割り引き', () => {
  /** 名称・台数・料金・種別すべて未登録の、実体が怪しい点 */
  const vague = (overrides = {}) =>
    lot({ named: false, capacity: null, fee: 'unknown', kind: 'unknown', operator: null, ...overrides });

  it('すぐ近くでも、情報が無い点は情報の揃った少し遠い駐車場に勝てない', () => {
    // 実際の画面で「駐車場（名称なし）」が 1 位に来ていた状況
    const nearVague = vague({ distanceM: 40, walkMinutes: 1 });
    const farKnown = lot({
      distanceM: 260, walkMinutes: 4, named: true, capacity: 80,
      fee: 'paid', kind: 'multi-storey', operator: 'タイムズ', openingHours: '24/7',
    });
    expect(scoreParking(farKnown, DEFAULT_FILTERS, { jpy: 800, capped: false }))
      .toBeGreaterThan(scoreParking(nearVague, DEFAULT_FILTERS, null));
  });

  it('同じ条件なら情報のある方が高い', () => {
    expect(scoreParking(lot({ named: true, capacity: 40, fee: 'free', kind: 'surface' }), DEFAULT_FILTERS, null))
      .toBeGreaterThan(scoreParking(vague(), DEFAULT_FILTERS, null));
  });

  it('施設利用者専用は割り引く', () => {
    const open = lot({ access: 'public' });
    const customers = lot({ access: 'customers' });
    expect(scoreParking(customers, DEFAULT_FILTERS, null))
      .toBeLessThan(scoreParking(open, DEFAULT_FILTERS, null));
  });

  it('路上の駐車枠は割り引く', () => {
    expect(scoreParking(lot({ kind: 'street-side' }), DEFAULT_FILTERS, null))
      .toBeLessThan(scoreParking(lot({ kind: 'surface' }), DEFAULT_FILTERS, null));
  });
});

describe('rankParking — 注意書きと絞り込み', () => {
  it('情報がほとんど無いものには注意書きを付ける', () => {
    const [first] = rank([
      lot({ named: false, capacity: null, fee: 'unknown', kind: 'unknown', operator: null, openingHours: null }),
    ]);
    expect(first.cautions).toContain('登録情報がほとんどなく、駐車場でない可能性があります');
  });

  it('施設利用者専用と路上には、それぞれの注意書きを付ける', () => {
    const ranked = rank([
      lot({ id: 'node/c', access: 'customers' }),
      lot({ id: 'node/s', kind: 'street-side' }),
    ]);
    const byId = Object.fromEntries(ranked.map((r) => [r.id, r.cautions]));
    expect(byId['node/c']).toContain('施設利用者専用の可能性があります');
    expect(byId['node/s']).toContain('路上の駐車枠です');
  });

  it('情報が揃っていれば注意書きを付けない', () => {
    const [first] = rank([lot({ named: true, capacity: 50, fee: 'free', kind: 'surface' })]);
    expect(first.cautions).toEqual([]);
  });

  it('「情報が確かなものだけ」で薄いものを外す', () => {
    const filters = { ...DEFAULT_FILTERS, reliableOnly: true };
    const ranked = rank(
      [
        lot({ id: 'node/vague', named: false, capacity: null, fee: 'unknown', kind: 'unknown', operator: null, openingHours: null }),
        lot({ id: 'node/known', named: true, capacity: 30, fee: 'paid', kind: 'surface' }),
      ],
      filters,
    );
    expect(ranked.map((r) => r.id)).toEqual(['node/known']);
  });
});
