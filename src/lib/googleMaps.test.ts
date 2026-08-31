import { describe, expect, it } from 'vitest';
import { buildDirectionsUrl, buildPlaceUrl, buildWalkUrl, formatLatLng } from './googleMaps';

const origin = { lat: 35.6812, lng: 139.7671 };
const destination = { lat: 35.6595, lng: 139.7005 };
const parking = { lat: 35.6601, lng: 139.7012 };

const paramsOf = (url: string) => new URL(url).searchParams;

describe('formatLatLng', () => {
  it('小数 6 桁に揃える', () => {
    expect(formatLatLng({ lat: 35.1, lng: 139 })).toBe('35.100000,139.000000');
  });
});

describe('buildDirectionsUrl', () => {
  it('direct は出発地から目的地への車ルート', () => {
    const params = paramsOf(
      buildDirectionsUrl({ origin, destination, parking: null, mode: 'direct' }),
    );
    expect(params.get('api')).toBe('1');
    expect(params.get('travelmode')).toBe('driving');
    expect(params.get('origin')).toBe('35.681200,139.767100');
    expect(params.get('destination')).toBe('35.659500,139.700500');
    expect(params.get('waypoints')).toBeNull();
  });

  it('via-parking は駐車場を経由地に入れる', () => {
    const params = paramsOf(
      buildDirectionsUrl({ origin, destination, parking, mode: 'via-parking' }),
    );
    expect(params.get('destination')).toBe('35.659500,139.700500');
    expect(params.get('waypoints')).toBe('35.660100,139.701200');
  });

  it('to-parking は駐車場を目的地にする', () => {
    const params = paramsOf(
      buildDirectionsUrl({ origin, destination, parking, mode: 'to-parking' }),
    );
    expect(params.get('destination')).toBe('35.660100,139.701200');
    expect(params.get('waypoints')).toBeNull();
  });

  it('出発地が無ければ origin を付けない（Google マップ側の現在地に任せる）', () => {
    const params = paramsOf(
      buildDirectionsUrl({ origin: null, destination, parking: null, mode: 'direct' }),
    );
    expect(params.has('origin')).toBe(false);
  });

  it('navigate 指定でナビを即開始する', () => {
    const params = paramsOf(
      buildDirectionsUrl({ origin, destination, parking, mode: 'to-parking', navigate: true }),
    );
    expect(params.get('dir_action')).toBe('navigate');
  });

  it('駐車場を使うモードで parking が無ければ落とす', () => {
    expect(() =>
      buildDirectionsUrl({ origin, destination, parking: null, mode: 'via-parking' }),
    ).toThrow();
  });
});

describe('buildWalkUrl', () => {
  it('駐車場から目的地への徒歩ルートになる', () => {
    const params = paramsOf(buildWalkUrl(parking, destination));
    expect(params.get('travelmode')).toBe('walking');
    expect(params.get('origin')).toBe('35.660100,139.701200');
    expect(params.get('destination')).toBe('35.659500,139.700500');
  });
});

describe('buildPlaceUrl', () => {
  it('名前があれば検索クエリに使う', () => {
    expect(paramsOf(buildPlaceUrl(parking, '三井のリパーク')).get('query')).toBe('三井のリパーク');
  });

  it('名前が空なら座標にフォールバックする', () => {
    expect(paramsOf(buildPlaceUrl(parking, '   ')).get('query')).toBe('35.660100,139.701200');
  });
});

describe('buildPlaceUrl — 名前が無い地点', () => {
  it('名前を渡さなければ座標で開く', () => {
    expect(paramsOf(buildPlaceUrl(parking)).get('query')).toBe('35.660100,139.701200');
  });
});
