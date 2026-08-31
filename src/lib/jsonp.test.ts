// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonp } from './jsonp';

/** 挿入された script を捕まえて、応答を手で起こせるようにする */
function interceptScripts() {
  const scripts: HTMLScriptElement[] = [];
  const original = document.head.append.bind(document.head);
  vi.spyOn(document.head, 'append').mockImplementation((...nodes: (Node | string)[]) => {
    for (const node of nodes) {
      if (node instanceof HTMLScriptElement) scripts.push(node);
    }
    original(...nodes);
  });
  return scripts;
}

/** script の src からコールバック関数名を取り出す */
const callbackNameOf = (script: HTMLScriptElement) =>
  new URL(script.src, 'https://example.test').searchParams.get('callback') as string;

const globals = () => window as unknown as Record<string, unknown>;

describe('jsonp', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.head.querySelectorAll('script').forEach((s) => s.remove());
  });

  it('コールバックが呼ばれたら解決する', async () => {
    const scripts = interceptScripts();
    const promise = jsonp<{ ok: boolean }>('https://example.test/api?q=1');

    const name = callbackNameOf(scripts[0]);
    (globals()[name] as (v: unknown) => void)({ ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('既存のクエリがあれば & で繋ぐ', () => {
    const scripts = interceptScripts();
    void jsonp('https://example.test/api?q=1').catch(() => {});
    expect(scripts[0].src).toContain('?q=1&callback=');
  });

  it('クエリが無ければ ? で繋ぐ', () => {
    const scripts = interceptScripts();
    void jsonp('https://example.test/api').catch(() => {});
    expect(scripts[0].src).toContain('/api?callback=');
  });

  it('解決したら script とコールバックを片付ける', async () => {
    const scripts = interceptScripts();
    const promise = jsonp('https://example.test/api');
    const name = callbackNameOf(scripts[0]);

    (globals()[name] as (v: unknown) => void)({});
    await promise;

    expect(name in globals()).toBe(false);
    expect(scripts[0].isConnected).toBe(false);
  });

  it('読み込みに失敗したら拒否する', async () => {
    const scripts = interceptScripts();
    const promise = jsonp('https://example.test/api');

    scripts[0].onerror?.(new Event('error'));

    await expect(promise).rejects.toThrow('接続できませんでした');
  });

  it('応答が無ければ打ち切る', async () => {
    interceptScripts();
    const promise = jsonp('https://example.test/api', { timeoutMs: 5000 });

    const assertion = expect(promise).rejects.toThrow('応答がありませんでした');
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
  });

  it('打ち切ったあともコールバックを残さない', async () => {
    const scripts = interceptScripts();
    const promise = jsonp('https://example.test/api', { timeoutMs: 5000 });
    const name = callbackNameOf(scripts[0]);

    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;

    expect(name in globals()).toBe(false);
  });

  it('中止できる', async () => {
    interceptScripts();
    const controller = new AbortController();
    const promise = jsonp('https://example.test/api', { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toThrow('中止されました');
  });

  it('最初から中止済みなら何も読み込まない', async () => {
    const scripts = interceptScripts();
    const controller = new AbortController();
    controller.abort();

    await expect(jsonp('https://example.test/api', { signal: controller.signal })).rejects.toThrow();
    expect(scripts).toHaveLength(0);
  });

  it('呼び出しごとに別のコールバック名を使う', () => {
    const scripts = interceptScripts();
    void jsonp('https://example.test/api').catch(() => {});
    void jsonp('https://example.test/api').catch(() => {});
    expect(callbackNameOf(scripts[0])).not.toBe(callbackNameOf(scripts[1]));
  });
});
