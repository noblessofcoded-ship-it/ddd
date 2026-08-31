import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearParkingCache, fetchNearbyParking, searchRadiusFor } from './overpass';

const DESTINATION = { lat: 34.669, lng: 135.502 };

const lotElement = (id: number) => ({
  type: 'node' as const,
  id,
  lat: 34.6695,
  lon: 135.5025,
  tags: { amenity: 'parking', name: `駐車場${id}`, fee: 'yes', charge: '300円/30分', capacity: '20' },
});

/** 応答を手動で解決できる fetch のスタブ */
function controllableFetch() {
  const calls: Array<{ url: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) =>
    new Promise((resolve, reject) => {
      calls.push({
        url: String(input),
        resolve: (payload) => resolve({ ok: true, json: async () => payload } as Response),
        reject,
      });
    }),
  );
  return calls;
}

describe('searchRadiusFor', () => {
  it('徒歩距離より少し広く取る', () => {
    expect(searchRadiusFor(500)).toBe(750);
    expect(searchRadiusFor(800)).toBe(1200);
  });

  it('狭すぎ・広すぎを抑える', () => {
    expect(searchRadiusFor(100)).toBe(400);
    expect(searchRadiusFor(1200)).toBe(1500);
  });
});

describe('fetchNearbyParking — 応答を待つ間の振る舞い', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearParkingCache();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('まず 1 つ目だけに投げる', async () => {
    const calls = controllableFetch();
    void fetchNearbyParking(DESTINATION, 750);
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('overpass-api.de');
  });

  it('1 つ目が速ければ、ミラーには投げない', async () => {
    const calls = controllableFetch();
    const promise = fetchNearbyParking(DESTINATION, 750);
    await vi.advanceTimersByTimeAsync(0);

    calls[0].resolve({ elements: [lotElement(1)] });
    const lots = await promise;

    expect(lots).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('1 つ目が遅ければミラーにも投げ、先に返った方を採る', async () => {
    const calls = controllableFetch();
    const promise = fetchNearbyParking(DESTINATION, 750);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);

    // 待っても返らないのでミラーへ
    await vi.advanceTimersByTimeAsync(1300);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('kumi.systems');

    calls[1].resolve({ elements: [lotElement(2)] });
    expect((await promise)[0].name).toBe('駐車場2');
  });

  it('1 つ目が失敗したら、待たずにミラーへ進む', async () => {
    const calls = controllableFetch();
    const promise = fetchNearbyParking(DESTINATION, 750);
    await vi.advanceTimersByTimeAsync(0);

    calls[0].reject(new Error('network down'));
    await vi.advanceTimersByTimeAsync(1300);

    expect(calls).toHaveLength(2);
    calls[1].resolve({ elements: [lotElement(3)] });
    expect((await promise)[0].name).toBe('駐車場3');
  });

  it('すべて失敗したらエラーにする', async () => {
    const calls = controllableFetch();
    const promise = fetchNearbyParking(DESTINATION, 750);
    await vi.advanceTimersByTimeAsync(0);
    calls[0].reject(new Error('down'));
    await vi.advanceTimersByTimeAsync(1300);
    calls[1].reject(new Error('down'));

    await expect(promise).rejects.toThrow('Overpass への問い合わせに失敗しました');
  });
});

describe('fetchNearbyParking — キャッシュ', () => {
  beforeEach(() => clearParkingCache());
  afterEach(() => vi.unstubAllGlobals());

  it('同じ場所・同じ半径なら 2 回目は問い合わせない', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ elements: [lotElement(1)] }) }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    await fetchNearbyParking(DESTINATION, 750);
    await fetchNearbyParking(DESTINATION, 750);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('半径が変われば問い合わせ直す', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ elements: [lotElement(1)] }) }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    await fetchNearbyParking(DESTINATION, 750);
    await fetchNearbyParking(DESTINATION, 1200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
