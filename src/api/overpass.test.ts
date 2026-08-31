import { describe, expect, it } from 'vitest';
import { dedupeParking, parseParkingElement, type OverpassElement } from './overpass';
import { EMPTY_FEE } from '../lib/fee';
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

  it('charge から単価と最大料金を読み取る', () => {
    const lot = parseParkingElement(
      element({ tags: { charge: '300円/30分 最大1,000円' } }),
      destination,
    );
    expect(lot?.parsedFee.rate).toEqual({ unitJpy: 300, unitMinutes: 30 });
    expect(lot?.parsedFee.maxJpy).toBe(1000);
  });

  it('charge と fee:conditions に情報が散っていても両方拾う', () => {
    const lot = parseParkingElement(
      element({ tags: { charge: '300円/30分', 'fee:conditions': '最大1,500円' } }),
      destination,
    );
    expect(lot?.parsedFee.rate).toEqual({ unitJpy: 300, unitMinutes: 30 });
    expect(lot?.parsedFee.maxJpy).toBe(1500);
  });

  it('maxstay を分に直す', () => {
    expect(parseParkingElement(element({ tags: { maxstay: '2 h' } }), destination)?.maxStayMinutes)
      .toBe(120);
    expect(parseParkingElement(element({ tags: {} }), destination)?.maxStayMinutes).toBeNull();
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
    parsedFee: EMPTY_FEE,
    kind: 'unknown',
    capacity: null,
    openingHours: null,
    maxStayMinutes: null,
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

describe('parseParkingElement — 料金タグの拾い漏れ対策', () => {
  const el = (tags: Record<string, string>) =>
    parseParkingElement(element({ tags: { amenity: 'parking', ...tags } }), destination);

  it('fee:conditional からも有料と判定する', () => {
    expect(el({ 'fee:conditional': 'yes @ (09:00-22:00)' })?.fee).toBe('paid');
  });

  it('charge:conditional の金額を読む', () => {
    const lot = el({ 'charge:conditional': '300円/30分 @ (08:00-20:00)' });
    expect(lot?.parsedFee.rate).toEqual({ unitJpy: 300, unitMinutes: 30 });
  });

  it('旧来の parking:condition:N:charge を読む', () => {
    const lot = el({ 'parking:condition:1:charge': '200円/20分', 'parking:condition:2:charge': '最大900円' });
    expect(lot?.parsedFee.rate).toEqual({ unitJpy: 200, unitMinutes: 20 });
    expect(lot?.parsedFee.maxJpy).toBe(900);
  });

  it('parking:fee も見る', () => {
    expect(el({ 'parking:fee': '400円/60分' })?.parsedFee.rate).toEqual({ unitJpy: 400, unitMinutes: 60 });
  });

  it('金額を含まない yes/no だけの条件タグは料金文として使わない', () => {
    const lot = el({ fee: 'yes', 'fee:conditional': 'no @ customers' });
    expect(lot?.fee).toBe('paid');
    expect(lot?.feeNote).toBeNull();
  });

  it('parking:condition:1:maxstay も読む', () => {
    expect(el({ 'parking:condition:1:maxstay': '3 h' })?.maxStayMinutes).toBe(180);
  });

  it('複数のタグに散っていても繋げて解釈する', () => {
    const lot = el({ charge: '300円/30分', 'fee:conditions': '最大1,500円' });
    expect(lot?.parsedFee.rate).toEqual({ unitJpy: 300, unitMinutes: 30 });
    expect(lot?.parsedFee.maxJpy).toBe(1500);
  });
});
