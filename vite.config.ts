import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages はリポジトリ名のサブパス配下で配信されるため、
// デプロイ時だけ BASE_PATH（例: /ddd/）を渡してビルドする。
// 手元での dev / build は指定不要でルート配信のまま動く。
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: { host: true },
});
