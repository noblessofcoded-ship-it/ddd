const YAHOO_APP_ID_KEY = 'parking-route:yahoo-app-id:v1';

/**
 * Yahoo! ローカルサーチAPI の Client ID を読む。
 *
 * このアプリは公開リポジトリの静的サイトなので、ID をソースに含めない。
 * 利用者が自分の ID を入れて端末に保存する形にしている。
 * 自分で配信する場合は、ビルド時に VITE_YAHOO_APP_ID を渡してもよい。
 */
export function loadYahooAppId(): string | null {
  try {
    const stored = localStorage.getItem(YAHOO_APP_ID_KEY)?.trim();
    if (stored) return stored;
  } catch {
    // プライベートブラウズなどで読めない場合は既定値に任せる
  }

  const fromBuild = import.meta.env.VITE_YAHOO_APP_ID?.trim();
  return fromBuild ? fromBuild : null;
}

/** Client ID を保存する。空文字なら消す */
export function saveYahooAppId(appId: string): string | null {
  const trimmed = appId.trim();
  try {
    if (trimmed) localStorage.setItem(YAHOO_APP_ID_KEY, trimmed);
    else localStorage.removeItem(YAHOO_APP_ID_KEY);
  } catch {
    // 保存できなくても、その場では使えるようにする
  }
  return trimmed ? trimmed : null;
}
