/**
 * 検索クエリの正規化。
 * 全角空白・全角英数・重複空白を揃える。「台湾鍋　民生炒飯」のような
 * 全角空白区切りがそのままだと 1 語として扱われ、検索が空振りするため。
 */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize('NFKC') // 全角英数・記号を半角に、半角カナを全角に
    .replace(/[　\s]+/g, ' ') // 全角空白を含む空白を半角 1 個に
    .trim();
}

/** 正規化したうえで空白区切りの語に分ける */
export function tokenize(raw: string): string[] {
  const normalized = normalizeQuery(raw);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

/**
 * 検索を段階的に緩めるための候補列を作る。
 * 例: 「台湾鍋 民生炒飯」→ ["台湾鍋 民生炒飯", "民生炒飯", "台湾鍋"]
 *
 * 店名は「ジャンル + 屋号」の形で書かれることが多く、OSM には屋号だけが
 * 登録されているケースがある。全語 AND で空振りしたときに語を落として
 * 再検索できるよう、長い語（＝固有名詞である可能性が高い）から順に並べる。
 */
export function buildQueryVariants(raw: string): string[] {
  const tokens = tokenize(raw);
  if (tokens.length === 0) return [];

  const full = tokens.join(' ');
  if (tokens.length === 1) return [full];

  const byLengthDesc = [...tokens].sort((a, b) => b.length - a.length || tokens.indexOf(a) - tokens.indexOf(b));

  // 全語 → 長い語だけ → 次に長い語… の順。重複は落とす
  return [...new Set([full, ...byLengthDesc])];
}
