import { describe, expect, it } from 'vitest';
import { buildParkingSearchUrl, isParkingFeature, toParkingLots } from './yahooParking';
import type { YahooResponse } from './yahooLocal';

const DEST = { lat: 34.7055, lng: 135.5125 };

describe('buildParkingSearchUrl', () => {
  it('駐車場を業種名で引き、近い順に並べる', () => {
    const params = new URL(buildParkingSearchUrl(DEST, 750, 'APPID', 30)).searchParams;
    expect(params.get('query')).toBe('駐車場');
    expect(params.get('sort')).toBe('dist');
    expect(params.get('lat')).toBe('34.7055');
    expect(params.get('lon')).toBe('135.5125');
  });

  it('半径をキロメートルに直して渡す', () => {
    expect(new URL(buildParkingSearchUrl(DEST, 750, 'A', 30)).searchParams.get('dist')).toBe('0.75');
  });

  it('20km を超えないようにする', () => {
    expect(new URL(buildParkingSearchUrl(DEST, 50_000, 'A', 30)).searchParams.get('dist')).toBe('20');
  });
});

describe('isParkingFeature', () => {
  it('業種名が駐車場なら通す', () => {
    expect(isParkingFeature([{ Name: '駐車場' }], 'タイムズ天満')).toBe(true);
    expect(isParkingFeature([{ Name: 'コインパーキング' }], 'なにか')).toBe(true);
  });

  it('別の業種は落とす', () => {
    // 「駐車場付き不動産」のような、語だけ一致する別業種を除く
    expect(isParkingFeature([{ Name: '不動産' }], '駐車場のある物件')).toBe(false);
  });

  it('業種が無ければ名前で判断する', () => {
    expect(isParkingFeature(undefined, 'タイムズ天満パーキング')).toBe(true);
    expect(isParkingFeature([], '肉の天満屋')).toBe(false);
  });
});

describe('toParkingLots', () => {
  const response: YahooResponse = {
    Feature: [
      {
        Id: 'a',
        Name: 'タイムズ天満第2',
        Geometry: { Coordinates: '135.5130,34.7060' },
        Property: { Uid: 'uid-1', Address: '大阪府大阪市北区天満2-5', Genre: [{ Name: '駐車場' }] },
      },
      {
        Id: 'b',
        Name: '天満不動産',
        Geometry: { Coordinates: '135.5131,34.7061' },
        Property: { Uid: 'uid-2', Genre: [{ Name: '不動産' }] },
      },
    ],
  };

  it('駐車場だけを取り出す', () => {
    const lots = toParkingLots(response, DEST);
    expect(lots.map((lot) => lot.name)).toEqual(['タイムズ天満第2']);
  });

  it('出どころを yahoo として記録する', () => {
    expect(toParkingLots(response, DEST)[0].source).toBe('yahoo');
  });

  it('固有名として扱い、住所も持たせる', () => {
    const [lot] = toParkingLots(response, DEST);
    expect(lot.named).toBe(true);
    expect(lot.address).toBe('大阪府大阪市北区天満2-5');
  });

  it('目的地からの距離と徒歩時間を出す', () => {
    const [lot] = toParkingLots(response, DEST);
    expect(lot.distanceM).toBeGreaterThan(0);
    expect(lot.walkMinutes).toBeGreaterThanOrEqual(1);
  });

  it('持っていない情報は空のままにする（推測しない）', () => {
    const [lot] = toParkingLots(response, DEST);
    expect(lot.fee).toBe('unknown');
    expect(lot.capacity).toBeNull();
    expect(lot.maxHeightM).toBeNull();
    expect(lot.kind).toBe('unknown');
  });

  it('中身が無くても落ちない', () => {
    expect(toParkingLots({}, DEST)).toEqual([]);
  });
});
