import { describe, expect, it } from 'vitest';
import { dedupeParking, parseParkingElement, type OverpassElement } from './overpass';
import type { ParkingLot } from '../types';

const destination = { lat: 35.6595, lng: 139.7005 };

function element(overrides: Partial<OverpassElement> = {}): OverpassElement {
  return {
    type: 'node',
    id: 1,
    lat: 35.6601,
    lon: 139.7012,
    tags: { amenity: 'parking' },
    ...overrides,
  };
}

describe('parseParkingElement', () => {
  it('node の座標から距離と徒歩時間を出す', () => {
    const lot = parseParkingElement(element(), destination);
    expect(lot).not.toBeNull();
    expect(lot!.distanceM).toBeGreaterThan(0);
    expect(lot!.walkMinutes).toBeGreaterThanOrEqual(1);
  });

  it('way は center の座標を使う', () => {
    const lot = parseParkingElement(
      element({ type: 'way', lat: undefined, lon: undefined, center: { lat: 35.66, lon: 139.701 } }),
      destination,
    );
    expect(lot?.id).toBe('way/1');
    expect(lot?.lat).toBe(35.66);
  });

  it('座標が無ければ null', () => {
    expect(
      parseParkingElement(element({ lat: undefined, lon: undefined }), destination),
    ).toBeNull();
  });

  it('私有・許可制の駐車場は除外する', () => {
    expect(
      parseParkingElement(element({ tags: { amenity: 'parking', access: 'private' } }), destination),
    ).toBeNull();
    expect(
      parseParkingElement(element({ tags: { amenity: 'parking', parking: 'private' } }), destination),
    ).toBeNull();
  });

  it('fee タグを料金区分に落とす', () => {
    const free = parseParkingElement(element({ tags: { fee: 'no' } }), destination);
    const paid = parseParkingElement(element({ tags: { fee: 'yes' } }), destination);
    const unknown = parseParkingElement(element({ tags: {} }), destination);
    expect(free?.fee).toBe('free');
    expect(paid?.fee).toBe('paid');
    expect(unknown?.fee).toBe('unknown');
  });

  it('charge があれば有料とみなし料金メモに載せる', () => {
    const lot = parseParkingElement(element({ tags: { charge: '300円/60分' } }), destination);
    expect(lot?.fee).toBe('paid');
    expect(lot?.feeNote).toBe('300円/60分');
  });

  it('capacity から数値を取り出す', () => {
    expect(parseParkingElement(element({ tags: { capacity: '120' } }), destination)?.capacity).toBe(120);
    expect(parseParkingElement(element({ tags: { capacity: '約 45 台' } }), destination)?.capacity).toBe(45);
    expect(parseParkingElement(element({ tags: { capacity: 'yes' } }), destination)?.capacity).toBeNull();
  });

  it('maxheight はメートル表記だけ受ける', () => {
    expect(parseParkingElement(element({ tags: { maxheight: '2.1' } }), destination)?.maxHeightM).toBe(2.1);
    expect(parseParkingElement(element({ tags: { maxheight: '2.1 m' } }), destination)?.maxHeightM).toBe(2.1);
    expect(parseParkingElement(element({ tags: { maxheight: "6'6\"" } }), destination)?.maxHeightM).toBeNull();
  });

  it('parking タグを構造区分に対応づける', () => {
    expect(parseParkingElement(element({ tags: { parking: 'multi_storey' } }), destination)?.kind).toBe('multi-storey');
    expect(parseParkingElement(element({ tags: { parking: 'street_side' } }), destination)?.kind).toBe('street-side');
    expect(parseParkingElement(element({ tags: {} }), destination)?.kind).toBe('unknown');
  });

  it('名前が無ければ種別に応じた既定名を付ける', () => {
    expect(parseParkingElement(element({ tags: {} }), destination)?.name).toBe('駐車場（名称なし）');
    expect(parseParkingElement(element({ tags: { parking: 'street_side' } }), destination)?.name).toBe('路上パーキング');
    expect(parseParkingElement(element({ tags: { 'name:ja': 'A駐車場', name: 'A Parking' } }), destination)?.name).toBe('A駐車場');
  });
});

describe('dedupeParking', () => {
  const base: ParkingLot = {
    id: 'node/1',
    name: '中央駐車場',
    lat: 35.66,
    lng: 139.701,
    fee: 'unknown',
    feeNote: null,
    kind: 'unknown',
    capacity: null,
    openingHours: null,
    maxHeightM: null,
    distanceM: 100,
    walkMinutes: 2,
  };

  it('同名で近接する重複は情報の多い方を残す', () => {
    const detailed: ParkingLot = { ...base, id: 'way/2', fee: 'free', capacity: 30, kind: 'surface' };
    expect(dedupeParking([base, detailed])).toEqual([detailed]);
    expect(dedupeParking([detailed, base])).toEqual([detailed]);
  });

  it('名前が違えば別物として残す', () => {
    const other = { ...base, id: 'node/2', name: '南駐車場' };
    expect(dedupeParking([base, other])).toHaveLength(2);
  });

  it('同名でも離れていれば別物として残す', () => {
    const far = { ...base, id: 'node/3', lat: 35.67 };
    expect(dedupeParking([base, far])).toHaveLength(2);
  });
});
