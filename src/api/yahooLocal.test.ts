import { describe, expect, it } from 'vitest';
import { buildSearchUrl, parseCoordinates, toPlaces, type YahooResponse } from './yahooLocal';

const OSAKA = { lat: 34.6816, lng: 135.5062 };

describe('parseCoordinates', () => {
  it('"経度,緯度" の順を入れ替えて読む', () => {
    // Yahoo! は経度が先。取り違えると日本から飛び出す
    expect(parseCoordinates('135.5062,34.6816')).toEqual({ lat: 34.6816, lng: 135.5062 });
  });

  it('空白が入っていても読む', () => {
    expect(parseCoordinates(' 135.5062 , 34.6816 ')).toEqual({ lat: 34.6816, lng: 135.5062 });
  });

  it('壊れた値は null', () => {
    expect(parseCoordinates(undefined)).toBeNull();
    expect(parseCoordinates('')).toBeNull();
    expect(parseCoordinates('あ,い')).toBeNull();
    expect(parseCoordinates('135.5062')).toBeNull();
  });

  it('緯度経度の範囲を外れたものは弾く', () => {
    // 順序を取り違えた応答をそのまま通さないための歯止め
    expect(parseCoordinates('34.6816,135.5062')).toBeNull();
  });
});

describe('toPlaces', () => {
  const response: YahooResponse = {
    ResultInfo: { Count: 2, Status: 200 },
    Feature: [
      {
        Id: 'abc',
        Name: '肉の天満屋 神楽亭',
        Geometry: { Coordinates: '135.5125,34.7055' },
        Property: { Uid: 'uid-1', Address: '大阪府大阪市北区天満2-1-1', Genre: [{ Name: '焼肉' }] },
      },
      {
        Name: '座標が壊れている店',
        Geometry: { Coordinates: 'こわれている' },
        Property: { Uid: 'uid-2' },
      },
    ],
  };

  it('地点に変換する', () => {
    expect(toPlaces(response)).toEqual([
      {
        id: 'yahoo:uid-1',
        name: '肉の天満屋 神楽亭',
        address: '大阪府大阪市北区天満2-1-1',
        lat: 34.7055,
        lng: 135.5125,
      },
    ]);
  });

  it('座標や名前が欠けたものは捨てる', () => {
    expect(toPlaces(response)).toHaveLength(1);
  });

  it('Uid が無ければ Id を使う', () => {
    const places = toPlaces({ Feature: [{ Id: 'fallback', Name: '店', Geometry: { Coordinates: '135,34' } }] });
    expect(places[0].id).toBe('yahoo:fallback');
  });

  it('中身が無くても落ちない', () => {
    expect(toPlaces({})).toEqual([]);
    expect(toPlaces({ Feature: [] })).toEqual([]);
  });
});

describe('buildSearchUrl', () => {
  it('必要なパラメータを組み立てる', () => {
    const url = new URL(buildSearchUrl('神楽亭', 'APPID'));
    expect(url.origin + url.pathname).toBe('https://map.yahooapis.jp/search/local/V1/localSearch');
    expect(url.searchParams.get('appid')).toBe('APPID');
    expect(url.searchParams.get('query')).toBe('神楽亭');
    expect(url.searchParams.get('output')).toBe('json');
  });

  it('現在地があれば近い順にする', () => {
    const params = new URL(buildSearchUrl('神楽亭', 'APPID', { near: OSAKA })).searchParams;
    expect(params.get('lat')).toBe('34.6816');
    expect(params.get('lon')).toBe('135.5062');
    expect(params.get('sort')).toBe('dist');
  });

  it('半径は絞らない（離れた土地の店を落とさないため）', () => {
    expect(new URL(buildSearchUrl('神楽亭', 'APPID', { near: OSAKA })).searchParams.has('dist'))
      .toBe(false);
  });

  it('現在地が無ければ位置の指定を付けない', () => {
    const params = new URL(buildSearchUrl('神楽亭', 'APPID')).searchParams;
    expect(params.has('lat')).toBe(false);
    expect(params.has('sort')).toBe(false);
  });
});
