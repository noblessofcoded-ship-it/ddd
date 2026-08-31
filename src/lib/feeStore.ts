import type { ParkingLot } from '../types';
import { parseCharge } from './fee';

const STORAGE_KEY = 'parking-route:fee-notes:v1';

/** 利用者が自分で登録した料金 */
export type FeeNote = {
  /** 「300円/30分 最大1500円」のような入力そのまま */
  charge: string;
  /** 登録日時（epoch ミリ秒） */
  updatedAt: number;
};

export type FeeNotes = Record<string, FeeNote>;

/**
 * 保存済みの料金メモを読む。
 * プライベートブラウズなどで localStorage が使えないことがあるため、
 * 失敗しても空として扱い、アプリ全体は動き続けるようにする。
 */
export function loadFeeNotes(): FeeNotes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    // 壊れた値が混ざっていても、読める分だけ使う
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([id, value]) => {
        if (typeof value !== 'object' || value === null) return [];
        const note = value as Partial<FeeNote>;
        if (typeof note.charge !== 'string' || note.charge.trim().length === 0) return [];
        return [[id, { charge: note.charge, updatedAt: Number(note.updatedAt) || 0 }]];
      }),
    );
  } catch {
    return {};
  }
}

function persist(notes: FeeNotes): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // 保存できなくても、その場の表示には反映されている
  }
}

/** 料金メモを追加・更新した結果を返す */
export function saveFeeNote(notes: FeeNotes, id: string, charge: string): FeeNotes {
  const trimmed = charge.trim();
  if (trimmed.length === 0) return removeFeeNote(notes, id);

  const next = { ...notes, [id]: { charge: trimmed, updatedAt: Date.now() } };
  persist(next);
  return next;
}

/** 料金メモを消した結果を返す */
export function removeFeeNote(notes: FeeNotes, id: string): FeeNotes {
  if (!(id in notes)) return notes;
  const next = { ...notes };
  delete next[id];
  persist(next);
  return next;
}

/**
 * 取得した駐車場に、自分で登録した料金を上書きする。
 * OSM に料金が無いものを埋めるのが主目的だが、
 * 現地で見た金額の方が正しいので、OSM 側に値があっても上書きする。
 */
export function applyFeeNotes(lots: ParkingLot[], notes: FeeNotes): ParkingLot[] {
  if (Object.keys(notes).length === 0) return lots;

  return lots.map((lot) => {
    const note = notes[lot.id];
    if (!note) return lot;

    return {
      ...lot,
      fee: 'paid',
      feeNote: note.charge,
      parsedFee: parseCharge(note.charge),
      feeSource: 'user',
    };
  });
}
