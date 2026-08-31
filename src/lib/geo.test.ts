import { describe, expect, it } from 'vitest';
import { boundsOf, compassDirection, distanceMeters, formatDistance, walkMinutes } from './geo';

describe('distanceMeters', () => {
  it('同じ地点なら 0', () => {
    const point = { lat: 35.6812, lng: 139.7671 };
    expect(distanceMeters(point, point)).toBe(0);
  });

  it('東京駅〜皇居はおよそ 1.8km', () => {
    const tokyoStation = { lat: 35.6812, lng: 139.7671 };
    const imperialPalace = { lat: 35.6852, lng: 139.7528 };
    expect(distanceMeters(tokyoStation, imperialPalace)).toBeGreaterThan(1200);
    expect(distanceMeters(tokyoStation, imperialPalace)).toBeLessThan(1600);
  });

  it('向きを入れ替えても同じ距離になる', () => {
    const a = { lat: 34.7, lng: 135.5 };
    const b = { lat: 35.0, lng: 135.8 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('walkMinutes', () => {
  it('分速 80m を迂回込みで見積もる', () => {
    expect(walkMinutes(240)).toBe(4);
    expect(walkMinutes(800)).toBe(13);
  });

  it('至近距離でも 0 分にはしない', () => {
    expect(walkMinutes(5)).toBe(1);
  });
});

describe('formatDistance', () => {
  it('1km 未満は 10m 単位の m 表記', () => {
    expect(formatDistance(284)).toBe('280m');
  });

  it('1km 以上は km 表記', () => {
    expect(formatDistance(1440)).toBe('1.4km');
  });
});

describe('boundsOf', () => {
  it('全点を含む矩形を返す', () => {
    expect(
      boundsOf([
        { lat: 35, lng: 139 },
        { lat: 36, lng: 140 },
        { lat: 34, lng: 141 },
      ]),
    ).toEqual([
      [34, 139],
      [36, 141],
    ]);
  });

  it('点がなければ null', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('compassDirection', () => {
  const origin = { lat: 34.669, lng: 135.502 };

  it('東西南北を返す', () => {
    expect(compassDirection(origin, { lat: 34.679, lng: 135.502 })).toBe('北');
    expect(compassDirection(origin, { lat: 34.659, lng: 135.502 })).toBe('南');
    expect(compassDirection(origin, { lat: 34.669, lng: 135.512 })).toBe('東');
    expect(compassDirection(origin, { lat: 34.669, lng: 135.492 })).toBe('西');
  });

  it('斜めは 8 方位に丸める', () => {
    expect(compassDirection(origin, { lat: 34.679, lng: 135.512 })).toBe('北東');
    expect(compassDirection(origin, { lat: 34.659, lng: 135.492 })).toBe('南西');
  });

  it('同じ地点でも文字列を返す（表示が壊れないこと）', () => {
    expect(COMPASS_VALUES).toContain(compassDirection(origin, origin));
  });
});

const COMPASS_VALUES = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
