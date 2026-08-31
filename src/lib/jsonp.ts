/**
 * JSONP でデータを取る。
 *
 * Yahoo! のAPIは CORS ヘッダを返さないため、fetch では読めない。
 * script タグ経由なら同一生成元ポリシーの対象外になるので、
 * 中継サーバを立てずに静的サイトから呼べる。
 *
 * 取得先のスクリプトをそのまま実行することになるので、
 * 信頼できる相手にだけ使うこと。
 */
export type JsonpOptions = {
  signal?: AbortSignal;
  /** 応答が無いまま打ち切るまでの時間 */
  timeoutMs?: number;
  /** コールバック関数名を渡すクエリパラメータ名 */
  callbackParam?: string;
};

let sequence = 0;

export function jsonp<T>(url: string, options: JsonpOptions = {}): Promise<T> {
  const { signal, timeoutMs = 8000, callbackParam = 'callback' } = options;

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('中止されました'));
      return;
    }

    sequence += 1;
    const callbackName = `__jsonp_${Date.now().toString(36)}_${sequence}`;
    const script = document.createElement('script');
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      script.remove();
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };

    function onAbort() {
      cleanup();
      reject(new Error('中止されました'));
    }

    (window as unknown as Record<string, unknown>)[callbackName] = (payload: T) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('検索サービスに接続できませんでした'));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error('検索サービスの応答がありませんでした'));
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort, { once: true });

    const separator = url.includes('?') ? '&' : '?';
    script.src = `${url}${separator}${callbackParam}=${callbackName}`;
    document.head.append(script);
  });
}
