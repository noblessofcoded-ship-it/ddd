/** 営業状態。判定できない書式は unknown にして候補から落とさない */
export type OpenState = 'open' | 'closed' | 'unknown';

const DAY_INDEX: Record<string, number> = {
  su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6,
};

/** 対応できない構文。これらを含む場合は素直に unknown を返す */
const UNSUPPORTED = /ph|sh|sunrise|sunset|dawn|dusk|easter|week\s|\[|\bopen\b|"/i;

type Rule = {
  /** 対象曜日（0=日）。空なら毎日 */
  days: Set<number>;
  /** 分単位の時間帯。[開始, 終了)。終了 < 開始 は日跨ぎ */
  spans: Array<[number, number]>;
  /** その曜日は休みという指定 */
  closed: boolean;
};

function parseDays(token: string): Set<number> | null {
  const days = new Set<number>();

  for (const part of token.split(',')) {
    const range = part.trim().match(/^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/);
    const single = part.trim().match(/^([A-Za-z]{2})$/);

    if (range) {
      const from = DAY_INDEX[range[1].toLowerCase()];
      const to = DAY_INDEX[range[2].toLowerCase()];
      if (from === undefined || to === undefined) return null;
      // Sa-Mo のように週をまたぐ指定も拾う
      for (let i = 0; i < 7; i += 1) {
        const day = (from + i) % 7;
        days.add(day);
        if (day === to) break;
      }
    } else if (single) {
      const day = DAY_INDEX[single[1].toLowerCase()];
      if (day === undefined) return null;
      days.add(day);
    } else {
      return null;
    }
  }

  return days.size > 0 ? days : null;
}

function parseSpans(token: string): Array<[number, number]> | null {
  const spans: Array<[number, number]> = [];

  for (const part of token.split(',')) {
    const matched = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!matched) return null;

    const start = Number(matched[1]) * 60 + Number(matched[2]);
    const end = Number(matched[3]) * 60 + Number(matched[4]);
    if (start > 1440 || end > 1440) return null;

    spans.push([start, end]);
  }

  return spans.length > 0 ? spans : null;
}

function parseRule(raw: string): Rule | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  // 「Mo-Fr 08:00-20:00」「08:00-20:00」「Su off」
  const matched = text.match(/^(?:([A-Za-z]{2}(?:\s*[-,]\s*[A-Za-z]{2})*)\s+)?(.+)$/);
  if (!matched) return null;

  const days = matched[1] ? parseDays(matched[1]) : new Set<number>();
  if (days === null) return null;

  const rest = matched[2].trim();
  if (/^(off|closed)$/i.test(rest)) {
    return { days, spans: [], closed: true };
  }

  const spans = parseSpans(rest);
  return spans === null ? null : { days, spans, closed: false };
}

function inSpan(minutes: number, [start, end]: [number, number]): boolean {
  if (end === start) return false;
  // 22:00-06:00 のような日跨ぎ
  if (end < start) return minutes >= start || minutes < end;
  return minutes >= start && minutes < end;
}

/**
 * OSM の opening_hours を評価して、今その駐車場が開いているかを返す。
 * 仕様全体は非常に大きいため、確実に読める書式だけを扱い、
 * 少しでも解釈が怪しいものは unknown にして候補から除外しない。
 */
export function evaluateOpeningHours(raw: string | null | undefined, now: Date): OpenState {
  if (!raw) return 'unknown';

  const text = raw.trim();
  if (text.length === 0) return 'unknown';
  if (text === '24/7') return 'open';
  if (/^(off|closed)$/i.test(text)) return 'closed';
  if (UNSUPPORTED.test(text)) return 'unknown';

  const rules: Rule[] = [];
  for (const chunk of text.split(';')) {
    if (chunk.trim().length === 0) continue;
    const rule = parseRule(chunk);
    if (rule === null) return 'unknown';
    rules.push(rule);
  }
  if (rules.length === 0) return 'unknown';

  const today = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  // 後ろの規則ほど優先される（opening_hours の仕様どおり）
  let state: OpenState = 'closed';
  let matchedAny = false;

  for (const rule of rules) {
    const appliesToday = rule.days.size === 0 || rule.days.has(today);
    if (!appliesToday) continue;

    matchedAny = true;
    if (rule.closed) {
      state = 'closed';
      continue;
    }
    state = rule.spans.some((span) => inSpan(minutes, span)) ? 'open' : 'closed';
  }

  // 前日から日跨ぎで営業しているケースを拾う
  if (state === 'closed') {
    const yesterday = (today + 6) % 7;
    for (const rule of rules) {
      if (rule.closed) continue;
      if (rule.days.size !== 0 && !rule.days.has(yesterday)) continue;
      if (rule.spans.some(([start, end]) => end < start && minutes < end)) return 'open';
    }
  }

  return matchedAny ? state : 'closed';
}
