/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Yahoo! ローカルサーチAPI の Client ID（任意。自分で配信する場合のみ） */
  readonly VITE_YAHOO_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
