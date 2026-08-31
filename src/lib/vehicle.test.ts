import { describe, expect, it } from 'vitest';
import { VEHICLE_PRESETS, exceedsLimits, findVehicle } from './vehicle';
import { EMPTY_FEE } from './fee';
import type { ParkingLot } from '../types';

function lot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'node/1',
    name: 'テスト駐車場',
    named: true,
    address: null,
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
    maxWidthM: null,
    maxLengthM: null,
    surface: null,
    distanceM: 100,
    walkMinutes: 2,
    ...overrides,
  };
}

const minivan = findVehicle('ミニバン・SUV')!;
const kei = findVehicle('軽自動車')!;

describe('VEHICLE_PRESETS', () => {
  it('軽自動車は幅が狭いが、背は低くない', () => {
    // 立体駐車場の 1.55m 制限で弾かれる軽自動車は多い
    expect(kei.widthM).toBeLessThan(minivan.widthM);
    expect(kei.heightM).toBeGreaterThan(1.55);
  });

  it('区分ごとに寸法が揃っている', () => {
    for (const preset of VEHICLE_PRESETS) {
      expect(preset.widthM).toBeGreaterThan(0);
      expect(preset.heightM).toBeGreaterThan(0);
      expect(preset.lengthM).toBeGreaterThan(0);
    }
  });
});

describe('findVehicle', () => {
  it('名前で引ける', () => {
    expect(findVehicle('軽自動車')?.widthM).toBe(1.48);
  });

  it('無い名前なら null', () => {
    expect(findVehicle('存在しない')).toBeNull();
  });
});

describe('exceedsLimits', () => {
  it('車高制限に引っかかる', () => {
    expect(exceedsLimits(lot({ maxHeightM: 1.55 }), minivan)).toBe(true);
    expect(exceedsLimits(lot({ maxHeightM: 2.1 }), minivan)).toBe(false);
  });

  it('車幅制限に引っかかる', () => {
    expect(exceedsLimits(lot({ maxWidthM: 1.7 }), minivan)).toBe(true);
    expect(exceedsLimits(lot({ maxWidthM: 1.7 }), kei)).toBe(false);
  });

  it('車長制限に引っかかる', () => {
    expect(exceedsLimits(lot({ maxLengthM: 4.5 }), minivan)).toBe(true);
    expect(exceedsLimits(lot({ maxLengthM: 4.5 }), kei)).toBe(false);
  });

  it('制限が未登録なら入れない扱いにしない', () => {
    expect(exceedsLimits(lot(), minivan)).toBe(false);
  });

  it('軽自動車でも 1.55m 制限には入らない', () => {
    // 背の高い軽が増えており、車種区分と高さは一致しない
    expect(exceedsLimits(lot({ maxHeightM: 1.55 }), kei)).toBe(true);
  });
});
