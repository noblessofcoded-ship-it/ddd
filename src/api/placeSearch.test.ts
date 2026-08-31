import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergePlaces, rankPlaces, searchPlaces } from './placeSearch';
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

describe('rankPlaces', () => {
  it('名前が合うものを、合わないものより上にする', () => {
    const unrelated = place({ id: 'near-unrelated', name: 'すぐ近くの無関係な店' });
    const hit = place({ id: 'far-hit', name: 'おくまん京橋西店', lat: 34.70, lng: 135.53 });
    const ranked = rankPlaces([unrelated, hit], ['おくまん'], OSAKA);
    expect(ranked.map((p) => p.id)).toEqual(['far-hit', 'near-unrelated']);
  });

  it('名前の一致度が同じなら近い順にする', () => {
    const far = place({ id: 'far', name: 'おくまん蒲生四丁目店', lat: 34.72, lng: 135.56 });
    const near = place({ id: 'near', name: 'おくまん京橋西店' });
    expect(rankPlaces([far, near], ['おくまん'], OSAKA).map((p) => p.id)).toEqual(['near', 'far']);
  });

  it('基準点が無ければ一致度だけで並べる', () => {
    const hit = place({ id: 'hit', name: 'おくまん本店' });
    const miss = place({ id: 'miss', name: '別の店' });
    expect(rankPlaces([miss, hit], ['おくまん'], null).map((p) => p.id)).toEqual(['hit', 'miss']);
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

/** Yahoo! ローカルサーチ形式のレスポンス（JSONP で返る中身） */
const yahooResponse = (names: string[]) => ({
  Feature: names.map((name, index) => ({
    Id: `y${index}`,
    Name: name,
    Geometry: { Coordinates: `${135.5019 + index * 0.001},34.6716` },
    Property: { Uid: `uid-${index}`, Address: `大阪府大阪市中央区${index}` },
  })),
});

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
    // 名前が合う「民生炒飯」だけを残し、無関係な結果は雑音として落とす
    expect(result.places.map((p) => p.name)).toEqual(['民生炒飯']);
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
    expect(result.triedQueries).toEqual(['台湾鍋 民生炒飯', '民生炒飯']);
    expect(result.relaxed).toBe(true);
    // 全語（位置バイアスあり）→ 全語（バイアスなし）→ 語を落として、の 3 段
    expect(calls.filter((c) => c.includes('photon'))).toHaveLength(3);
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
    expect(overpassCall).toContain('~"台湾鍋|民生炒飯"');
    expect(overpassCall).not.toContain('"台湾鍋 民生炒飯"');
  });

  it('1 文字の語は名称検索から外す（一致が多すぎるため）', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('interpreter')) return overpassResponse([]);
      return url.includes('photon') ? { features: [] } : [];
    });

    await searchPlaces('東 民生炒飯', { near: OSAKA });

    const overpassCall = calls.find((c) => c.startsWith('overpass:'));
    expect(overpassCall).toContain('~"民生炒飯"');
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

describe('searchPlaces — 当たり外れの判定', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('結果はあるが名前が合っていなければ、語を落として引き直す', async () => {
    // タイポ許容のジオコーダは「0 件」ではなく無関係な結果を返してくる。
    // 件数だけを見ていると、この状況で緩和検索が動かない
    const calls = stubFetch((url) => {
      if (!url.includes('photon')) return [];
      return url.includes('%E5%8F%B0%E6%B9%BE%E9%8D%8B+')
        ? photonResponse(['まったく無関係なラーメン店'])
        : photonResponse(['民生炒飯']);
    });

    const result = await searchPlaces('台湾鍋　民生炒飯', { near: OSAKA });
    expect(calls.filter((c) => c.includes('photon')).length).toBeGreaterThanOrEqual(2);
    expect(result.places.map((p) => p.name)).toEqual(['民生炒飯']);
  });

  it('結果はあるが名前が合っていなければ、Overpass の名称検索まで進む', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('interpreter')) return overpassResponse(['おくまん蒲生四丁目店', 'おくまん京橋西店']);
      if (url.includes('photon')) return photonResponse(['無関係な喫茶店']);
      return [];
    });

    const result = await searchPlaces('おくまん', { near: OSAKA });
    expect(calls.some((c) => c.startsWith('overpass:'))).toBe(true);
    expect(result.places.map((p) => p.name)).toEqual(['おくまん蒲生四丁目店', 'おくまん京橋西店']);
    expect(result.relaxed).toBe(true);
  });

  it('名前が合う結果があれば、それ以上は引かない', async () => {
    const calls = stubFetch((url) =>
      url.includes('photon') ? photonResponse(['おくまん京橋西店']) : [],
    );

    const result = await searchPlaces('おくまん', { near: OSAKA });
    expect(calls.filter((c) => c.includes('photon'))).toHaveLength(1);
    expect(calls.some((c) => c.startsWith('overpass:'))).toBe(false);
    expect(result.relaxed).toBe(false);
  });

  it('チェーン店の支店を取りこぼさず、近い順に並べる', async () => {
    stubFetch((url) => {
      if (url.includes('photon')) return photonResponse(['おくまん京橋西店', '無関係な店', 'おくまん蒲生四丁目店']);
      return [];
    });

    // photonResponse は index が大きいほど基準点に近い座標を返す。
    // 一致度が同じなので、間に挟まった無関係な店を落としたうえで近い順になる
    const result = await searchPlaces('おくまん', { near: OSAKA });
    expect(result.places.map((p) => p.name)).toEqual(['おくまん蒲生四丁目店', 'おくまん京橋西店']);
  });

  it('名前が合わないものは結果に混ぜず、別枠に回す', async () => {
    // 「神楽亭」を探して「神楽殿」「神楽橋」が並ぶような状態を防ぐ
    stubFetch((url) => {
      if (url.includes('interpreter')) return { elements: [] };
      return url.includes('photon') ? photonResponse(['神楽殿', '神楽橋', '神楽所 梅花殿']) : [];
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA });

    expect(result.places).toEqual([]);
    // 別枠に回したうえで、一致度が横並びなので近い順に並ぶ
    expect(result.nearMisses.map((p) => p.name).sort()).toEqual(
      ['神楽所 梅花殿', '神楽橋', '神楽殿'].sort(),
    );
  });
});

describe('searchPlaces — 現在地から離れた地点', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('現在地の近くに無ければ、位置バイアスを外して引き直す', async () => {
    // 現在地優先の検索では出てこないが、全国から探せば見つかる店
    const calls = stubFetch((url) => {
      if (!url.includes('photon')) return [];
      // lat が付いている＝位置バイアスあり。そのときは当たりを返さない
      return url.includes('lat=') ? photonResponse(['近所の無関係な店']) : photonResponse(['神楽亭']);
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA });

    const photonCalls = calls.filter((c) => c.includes('photon'));
    expect(photonCalls).toHaveLength(2);
    expect(photonCalls[0]).toContain('lat=');
    expect(photonCalls[1]).not.toContain('lat=');
    expect(result.places.map((p) => p.name)).toEqual(['神楽亭']);
    expect(result.relaxed).toBe(true);
  });

  it('1 段目で当たれば、バイアスを外した検索はしない', async () => {
    const calls = stubFetch((url) => (url.includes('photon') ? photonResponse(['神楽亭']) : []));

    const result = await searchPlaces('神楽亭', { near: OSAKA });

    expect(calls.filter((c) => c.includes('photon'))).toHaveLength(1);
    expect(result.relaxed).toBe(false);
  });

  it('現在地が無ければ、そもそもバイアスが無いので引き直さない', async () => {
    const calls = stubFetch((url) => (url.includes('photon') ? { features: [] } : []));

    await searchPlaces('神楽亭');

    expect(calls.filter((c) => c.includes('photon'))).toHaveLength(1);
  });

  it('バイアスを外した検索でも当たらなければ、Overpass まで進む', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('interpreter')) return overpassResponse(['神楽亭']);
      return url.includes('photon') ? { features: [] } : [];
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA });

    expect(calls.filter((c) => c.includes('photon'))).toHaveLength(2);
    expect(calls.some((c) => c.startsWith('overpass:'))).toBe(true);
    expect(result.places.map((p) => p.name)).toEqual(['神楽亭']);
  });
});

describe('searchPlaces — 正式名称の一部で探す', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  /**
   * 「肉の天満屋 神楽亭」を「神楽亭」で引く状況。
   * ジオコーダは語の単位でしか一致を見ないので、名前の途中や末尾だけを
   * 与えても当たらないことがある。部分一致は Overpass の正規表現に頼る。
   */
  it('ジオコーダが空でも、地図データの部分一致で見つける', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('interpreter')) return overpassResponse(['肉の天満屋 神楽亭']);
      return url.includes('photon') ? { features: [] } : [];
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA });

    expect(calls.some((c) => c.startsWith('overpass:'))).toBe(true);
    expect(result.places.map((p) => p.name)).toEqual(['肉の天満屋 神楽亭']);
    expect(result.usedNameSearch).toBe(true);
  });

  it('名前の一部でも「当たり」として扱う（雑音として落とさない）', async () => {
    stubFetch((url) => {
      if (url.includes('photon')) return photonResponse(['肉の天満屋 神楽亭', '無関係な店']);
      return [];
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA });
    expect(result.places.map((p) => p.name)).toEqual(['肉の天満屋 神楽亭']);
  });

  it('現在地が無いと部分一致の検索まで進めないことを結果で示す', async () => {
    stubFetch((url) => (url.includes('photon') ? { features: [] } : []));

    const result = await searchPlaces('神楽亭');

    expect(result.places).toEqual([]);
    expect(result.usedNameSearch).toBe(false);
  });

  it('現在地があれば部分一致の検索まで進んだことを示す', async () => {
    stubFetch((url) => {
      if (url.includes('interpreter')) return { elements: [] };
      return url.includes('photon') ? { features: [] } : [];
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA });
    expect(result.usedNameSearch).toBe(true);
  });
});

describe('searchPlaces — 見つからないことを正しく伝える', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('一致するものだけを結果にする', async () => {
    stubFetch((url) => {
      if (url.includes('interpreter')) return { elements: [] };
      return url.includes('photon') ? photonResponse(['肉の天満屋 神楽亭', '神楽殿']) : [];
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA });
    expect(result.places.map((p) => p.name)).toEqual(['肉の天満屋 神楽亭']);
    expect(result.nearMisses.map((p) => p.name)).toEqual(['神楽殿']);
  });

  it('検索サービスが落ちたことを記録する', async () => {
    stubFetch((url) => {
      if (url.includes('interpreter')) return { elements: [] };
      return url.includes('photon') ? null : [];
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA });
    expect(result.failed).toBe(true);
  });

  it('全部応答すれば failed は立てない', async () => {
    stubFetch((url) => {
      if (url.includes('interpreter')) return { elements: [] };
      return url.includes('photon') ? { features: [] } : [];
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA });
    expect(result.failed).toBe(false);
  });

  it('近い候補は件数を絞る', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `神楽殿${i}`);
    stubFetch((url) => {
      if (url.includes('interpreter')) return { elements: [] };
      return url.includes('photon') ? photonResponse(many) : [];
    });

    const result = await searchPlaces('神楽亭', { near: OSAKA, limit: 12 });
    expect(result.nearMisses.length).toBeLessThanOrEqual(12);
  });
});

describe('searchPlaces — Yahoo! ローカルサーチの併用', () => {
  /** JSONP は script タグで読むので、src を捕まえてコールバックを呼ぶ */
  function stubJsonp(payloadFor: (url: string) => unknown | null) {
    const requested: string[] = [];
    const head = { append: (script: HTMLScriptElement) => {
      requested.push(script.src);
      const name = new URL(script.src, 'https://x.test').searchParams.get('callback') as string;
      const payload = payloadFor(script.src);
      queueMicrotask(() => {
        if (payload === null) script.onerror?.(new Event('error'));
        else (globalThis as Record<string, any>)[name]?.(payload);
      });
    } };
    vi.stubGlobal('document', {
      createElement: () => ({ src: '', onerror: null, remove() {} }),
      head,
    });
    vi.stubGlobal('window', globalThis);
    return requested;
  }

  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('Client ID があれば Yahoo! も引き、OSM に無い店を拾う', async () => {
    stubFetch((url) => (url.includes('photon') ? { features: [] } : []));
    const requested = stubJsonp(() => yahooResponse(['肉の天満屋 神楽亭']));

    const result = await searchPlaces('神楽亭', { near: OSAKA, yahooAppId: 'APPID' });

    expect(requested[0]).toContain('map.yahooapis.jp');
    expect(requested[0]).toContain('appid=APPID');
    expect(result.places.map((p) => p.name)).toEqual(['肉の天満屋 神楽亭']);
  });

  it('Client ID が無ければ Yahoo! は呼ばない', async () => {
    stubFetch((url) => (url.includes('photon') ? { features: [] } : []));
    const requested = stubJsonp(() => yahooResponse(['肉の天満屋 神楽亭']));

    const result = await searchPlaces('神楽亭', { near: OSAKA });

    expect(requested).toHaveLength(0);
    expect(result.places).toEqual([]);
  });

  it('Yahoo! が落ちても OSM の結果は返す', async () => {
    stubFetch((url) => (url.includes('photon') ? photonResponse(['神楽亭']) : []));
    stubJsonp(() => null);

    const result = await searchPlaces('神楽亭', { near: OSAKA, yahooAppId: 'APPID' });

    expect(result.places.map((p) => p.name)).toEqual(['神楽亭']);
    expect(result.failed).toBe(true);
  });

  it('同じ店が両方から返っても 1 件にまとめる', async () => {
    stubFetch((url) => (url.includes('photon') ? photonResponse(['神楽亭']) : []));
    stubJsonp(() => yahooResponse(['神楽亭']));

    const result = await searchPlaces('神楽亭', { near: OSAKA, yahooAppId: 'APPID' });

    expect(result.places).toHaveLength(1);
    // 住所などの情報が多い Yahoo! 側を残す
    expect(result.places[0].id.startsWith('yahoo:')).toBe(true);
  });
});
