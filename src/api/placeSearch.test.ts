import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergePlaces, searchPlaces, sortByDistance } from './placeSearch';
import type { Place } from '../types';

const OSAKA = { lat: 34.6816, lng: 135.5062 };

const place = (overrides: Partial<Place> = {}): Place => ({
  id: 'p1',
  name: '民生炒飯',
  address: '大阪府 大阪市中央区',
  lat: 34.6716,
  lng: 135.5019,
  ...overrides,
});

describe('mergePlaces', () => {
  it('同名かつ近接する重複をまとめ、先に来た方を残す', () => {
    const first = place({ id: 'photon' });
    const second = place({ id: 'nominatim', lat: 34.67165 });
    expect(mergePlaces([[first], [second]])).toEqual([first]);
  });

  it('名前が違えば両方残す', () => {
    const merged = mergePlaces([[place({ id: 'a' })], [place({ id: 'b', name: '別の店' })]]);
    expect(merged).toHaveLength(2);
  });

  it('同名でも離れていれば両方残す（チェーン店など）', () => {
    const merged = mergePlaces([[place({ id: 'a' })], [place({ id: 'b', lat: 35.7 })]]);
    expect(merged).toHaveLength(2);
  });
});

describe('sortByDistance', () => {
  it('基準点に近い順に並べ替える', () => {
    const far = place({ id: 'far', name: '遠い', lat: 35.6812, lng: 139.7671 });
    const near = place({ id: 'near', name: '近い' });
    expect(sortByDistance([far, near], OSAKA).map((p) => p.id)).toEqual(['near', 'far']);
  });

  it('基準点が無ければ順序を変えない', () => {
    const list = [place({ id: 'a' }), place({ id: 'b', name: 'B' })];
    expect(sortByDistance(list, null)).toEqual(list);
  });
});

/** Photon 形式のレスポンス */
const photonResponse = (names: string[]) => ({
  features: names.map((name, index) => ({
    geometry: { coordinates: [135.5019 + index * 0.001, 34.6716] },
    properties: { osm_id: index + 1, osm_type: 'N', name, city: '大阪市', state: '大阪府' },
  })),
});

/** Nominatim 形式のレスポンス */
const nominatimResponse = (names: string[]) =>
  names.map((name, index) => ({
    place_id: 900 + index,
    lat: '34.6716',
    lon: String(135.52 + index * 0.001),
    name,
    display_name: `${name}, 中央区, 大阪市, 大阪府, 日本`,
  }));

/** Overpass 形式のレスポンス */
const overpassResponse = (names: string[]) => ({
  elements: names.map((name, index) => ({
    type: 'node',
    id: 500 + index,
    lat: 34.6716,
    lon: 135.5019,
    tags: { name, 'addr:city': '大阪市', 'addr:suburb': '中央区' },
  })),
});

type Handler = (url: string, body: string) => unknown | null;

/** URL と本文を見て応答を切り替える fetch のスタブ */
function stubFetch(handler: Handler) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? String(init.body) : '';
    calls.push(url.includes('interpreter') ? `overpass:${decodeURIComponent(body)}` : url);

    const payload = handler(url, body);
    if (payload === null) throw new Error('network down');
    return { ok: true, json: async () => payload } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('searchPlaces', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('Photon と Nominatim の結果をまとめて返す', async () => {
    stubFetch((url) => {
      if (url.includes('photon')) return photonResponse(['民生炒飯']);
      if (url.includes('nominatim')) return nominatimResponse(['別の中華料理店']);
      return { elements: [] };
    });

    const result = await searchPlaces('民生炒飯', { near: OSAKA });
    expect(result.places.map((p) => p.name)).toEqual(['民生炒飯', '別の中華料理店']);
    expect(result.relaxed).toBe(false);
  });

  it('全角空白を正規化して検索する', async () => {
    const calls = stubFetch((url) => (url.includes('photon') ? photonResponse(['民生炒飯']) : []));
    await searchPlaces('台湾鍋　民生炒飯', { near: OSAKA });

    const photonCall = calls.find((c) => c.includes('photon'));
    expect(photonCall).toContain('q=%E5%8F%B0%E6%B9%BE%E9%8D%8B+%E6%B0%91%E7%94%9F%E7%82%92%E9%A3%AF');
  });

  it('全語で見つからなければ語を落として再検索する', async () => {
    const calls = stubFetch((url) => {
      // 「台湾鍋 民生炒飯」では 0 件、「民生炒飯」だけならヒットする
      if (url.includes('photon')) {
        return url.includes('%E5%8F%B0%E6%B9%BE%E9%8D%8B+') ? { features: [] } : photonResponse(['民生炒飯']);
      }
      return [];
    });

    const result = await searchPlaces('台湾鍋　民生炒飯', { near: OSAKA });
    expect(result.places.map((p) => p.name)).toEqual(['民生炒飯']);
    expect(result.matchedQuery).toBe('民生炒飯');
    expect(result.relaxed).toBe(true);
    expect(calls.filter((c) => c.includes('photon'))).toHaveLength(2);
  });

  it('ジオコーダが空なら Overpass の名称検索に落とす', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('interpreter')) return overpassResponse(['民生炒飯']);
      return url.includes('photon') ? { features: [] } : [];
    });

    const result = await searchPlaces('民生炒飯', { near: OSAKA });
    expect(result.places.map((p) => p.name)).toEqual(['民生炒飯']);
    expect(calls.some((c) => c.startsWith('overpass:'))).toBe(true);
  });

  it('Overpass の名称検索は語の選択和で引く（空白入りのまま引くと必ず空振りするため）', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('interpreter')) return overpassResponse(['民生炒飯']);
      return url.includes('photon') ? { features: [] } : [];
    });

    await searchPlaces('台湾鍋　民生炒飯', { near: OSAKA });

    const overpassCall = calls.find((c) => c.startsWith('overpass:'));
    expect(overpassCall).toContain('"name"~"台湾鍋|民生炒飯"');
    expect(overpassCall).not.toContain('"台湾鍋 民生炒飯"');
  });

  it('1 文字の語は名称検索から外す（一致が多すぎるため）', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('interpreter')) return overpassResponse([]);
      return url.includes('photon') ? { features: [] } : [];
    });

    await searchPlaces('東 民生炒飯', { near: OSAKA });

    const overpassCall = calls.find((c) => c.startsWith('overpass:'));
    expect(overpassCall).toContain('"name"~"民生炒飯"');
  });

  it('現在地が無ければ Overpass の名称検索は行わない（範囲を絞れないため）', async () => {
    const calls = stubFetch((url) => (url.includes('photon') ? { features: [] } : []));
    const result = await searchPlaces('民生炒飯');
    expect(result.places).toEqual([]);
    expect(calls.some((c) => c.startsWith('overpass:'))).toBe(false);
  });

  it('片方のサービスが落ちても、もう片方の結果を返す', async () => {
    stubFetch((url) => {
      if (url.includes('photon')) return null; // Photon が落ちている
      if (url.includes('nominatim')) return nominatimResponse(['民生炒飯']);
      return { elements: [] };
    });

    const result = await searchPlaces('民生炒飯', { near: OSAKA });
    expect(result.places.map((p) => p.name)).toEqual(['民生炒飯']);
  });

  it('現在地に近い順で返す', async () => {
    stubFetch((url) => {
      if (url.includes('photon')) return photonResponse(['遠い店']);
      if (url.includes('nominatim')) return nominatimResponse(['近い店']);
      return { elements: [] };
    });

    // photon 側は lng=135.5019、nominatim 側は lng=135.52。基準点は 135.5062
    const result = await searchPlaces('店', { near: OSAKA });
    expect(result.places[0].name).toBe('遠い店');
  });

  it('空クエリでは検索しない', async () => {
    const calls = stubFetch(() => ({ features: [] }));
    const result = await searchPlaces('　 ');
    expect(result.places).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
