import { useState } from 'react';

const REGISTER_URL = 'https://e.developer.yahoo.co.jp/register';

type Props = {
  appId: string | null;
  onChange: (appId: string) => void;
};

/**
 * Yahoo! ローカルサーチAPI の Client ID を入れてもらう欄。
 *
 * このサイトは公開されている静的サイトなので、ID をソースに含めていない。
 * 使う人がそれぞれ自分の ID を入れ、その端末にだけ保存する。
 */
export function YahooSettings({ appId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(appId ?? '');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onChange(draft);
    setOpen(false);
  };

  return (
    <details className="yahoo" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="yahoo__summary">
        店舗の検索精度を上げる
        {appId ? <span className="badge">設定済み</span> : <span className="yahoo__off">未設定</span>}
      </summary>

      <p className="yahoo__note">
        地図データ（OpenStreetMap）には、個人商店などが登録されていないことがあります。
        Yahoo! ローカルサーチAPI の Client ID を設定すると、全国の電話帳データをもとにした
        店舗情報からも探せるようになります。無料で、1 日 5 万件まで使えます。
      </p>
      <p className="yahoo__note">
        <a href={REGISTER_URL} target="_blank" rel="noreferrer noopener">
          Yahoo!デベロッパーネットワークでアプリケーションを登録
        </a>
        して、発行された Client ID を貼り付けてください。
        入力した ID はこの端末にだけ保存され、どこにも送信されません。
      </p>

      <form className="yahoo__form" onSubmit={submit}>
        <input
          type="text"
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Client ID"
          autoComplete="off"
          spellCheck={false}
          aria-label="Yahoo! ローカルサーチAPI の Client ID"
        />
        <button type="submit" className="btn btn--primary btn--outline">
          保存
        </button>
      </form>
    </details>
  );
}
