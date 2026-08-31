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
 * 空白を詰めた形。
 *
 * 「肉の天満屋 神楽亭」を、地図データが「肉の天満屋神楽亭」と 1 語で
 * 持っていることがある。検索サービスは語の単位で一致を見るため、
 * 空白の有無が食い違うと当たらない。両方を試せるようにする。
 */
export function compactQuery(raw: string): string {
  return tokenize(raw).join('');
}

/**
 * 検索を段階的に緩めるための候補列を作る。
 * 例: 「台湾鍋 民生炒飯」→ ["台湾鍋 民生炒飯", "台湾鍋民生炒飯", "民生炒飯", "台湾鍋"]
 *
 * 店名は「屋号 + 店名」の形で書かれることが多く、地図データには片方だけが
 * 登録されているケースがある。全語で空振りしたときに、空白を詰めた形、
 * 続いて語を落とした形へと順に手を広げられるようにする。
 * 語は長い方（＝固有名詞である可能性が高い）から並べる。
 */
export function buildQueryVariants(raw: string): string[] {
  const tokens = tokenize(raw);
  if (tokens.length === 0) return [];

  const full = tokens.join(' ');
  if (tokens.length === 1) return [full];

  const byLengthDesc = [...tokens].sort(
    (a, b) => b.length - a.length || tokens.indexOf(a) - tokens.indexOf(b),
  );

  // 全語 → 空白を詰めた形 → 長い語だけ → 次に長い語… の順。重複は落とす
  return [...new Set([full, compactQuery(raw), ...byLengthDesc])];
}

/** 比較用に揃える。表記ゆれと空白を潰して部分一致を取りやすくする */
function foldForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\s　・･]/g, '');
}

/**
 * 地点名が検索語にどれだけ合っているかを点数にする。
 *
 * ジオコーダはタイポ許容のため、まったく関係のない地点も返してくる。
 * 「結果が 0 件かどうか」では当たり外れを判定できないので、
 * 名前に検索語が含まれるかで測る。
 *
 * 一致した語 1 つにつき 10 点、語で始まるなら +1 点。
 */
export function matchScore(name: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;

  const folded = foldForMatch(name);
  let score = 0;

  for (const token of tokens) {
    const needle = foldForMatch(token);
    if (needle.length === 0 || !folded.includes(needle)) continue;
    score += 10;
    if (folded.startsWith(needle)) score += 1;
  }

  return score;
}

/** 検索語のどれか 1 語でも名前に含まれていれば「当たり」とみなす */
export function isRelevant(name: string, tokens: string[]): boolean {
  return matchScore(name, tokens) > 0;
}
