import { describe, expect, it } from 'vitest';
import { buildQueryVariants, isRelevant, matchScore, normalizeQuery, tokenize } from './query';

describe('normalizeQuery', () => {
  it('全角空白を半角空白にする', () => {
    expect(normalizeQuery('台湾鍋　民生炒飯')).toBe('台湾鍋 民生炒飯');
  });

  it('連続した空白を 1 個にまとめる', () => {
    expect(normalizeQuery('渋谷   ヒカリエ')).toBe('渋谷 ヒカリエ');
    expect(normalizeQuery('渋谷 　 ヒカリエ')).toBe('渋谷 ヒカリエ');
  });

  it('前後の空白を落とす', () => {
    expect(normalizeQuery('　東京駅 ')).toBe('東京駅');
  });

  it('全角英数を半角にする', () => {
    expect(normalizeQuery('ＡＢＣストア１２３')).toBe('ABCストア123');
  });

  it('空文字はそのまま', () => {
    expect(normalizeQuery('   ')).toBe('');
  });
});

describe('tokenize', () => {
  it('全角空白区切りでも語に分ける', () => {
    expect(tokenize('台湾鍋　民生炒飯')).toEqual(['台湾鍋', '民生炒飯']);
  });

  it('空クエリは空配列', () => {
    expect(tokenize('　')).toEqual([]);
  });
});

describe('buildQueryVariants', () => {
  it('全語 → 長い語の順に緩めていく', () => {
    expect(buildQueryVariants('台湾鍋　民生炒飯')).toEqual([
      '台湾鍋 民生炒飯',
      '民生炒飯',
      '台湾鍋',
    ]);
  });

  it('同じ長さなら元の並び順を保つ', () => {
    expect(buildQueryVariants('渋谷 新宿')).toEqual(['渋谷 新宿', '渋谷', '新宿']);
  });

  it('1 語ならそのまま 1 件', () => {
    expect(buildQueryVariants('東京駅')).toEqual(['東京駅']);
  });

  it('重複する語は 1 回だけにする', () => {
    expect(buildQueryVariants('銀座 銀座')).toEqual(['銀座 銀座', '銀座']);
  });

  it('空クエリは空配列', () => {
    expect(buildQueryVariants('  ')).toEqual([]);
  });
});

describe('matchScore', () => {
  it('語が含まれていれば加点する', () => {
    expect(matchScore('おくまん 蒲生四丁目店', ['おくまん'])).toBeGreaterThan(0);
    expect(matchScore('まいどおおきに食堂', ['おくまん'])).toBe(0);
  });

  it('語で始まる方を高く評価する', () => {
    const starts = matchScore('おくまん京橋西店', ['おくまん']);
    const contains = matchScore('たこ焼きおくまん', ['おくまん']);
    expect(starts).toBeGreaterThan(contains);
  });

  it('一致した語が多いほど高い', () => {
    const tokens = ['台湾鍋', '民生炒飯'];
    expect(matchScore('台湾鍋 民生炒飯', tokens)).toBeGreaterThan(matchScore('民生炒飯', tokens));
  });

  it('空白や中黒の違いを無視する', () => {
    expect(matchScore('おくまん・蒲生四丁目店', ['おくまん蒲生四丁目店'])).toBeGreaterThan(0);
    expect(matchScore('おくまん 蒲生四丁目店', ['おくまん蒲生四丁目店'])).toBeGreaterThan(0);
  });

  it('全角半角の違いを無視する', () => {
    expect(matchScore('ＡＢＣストア', ['ABCストア'])).toBeGreaterThan(0);
  });

  it('語が無ければ 0', () => {
    expect(matchScore('どこかの店', [])).toBe(0);
  });
});

describe('isRelevant', () => {
  it('1 語でも含まれていれば当たり', () => {
    expect(isRelevant('おくまん蒲生四丁目店', ['台湾鍋', 'おくまん'])).toBe(true);
    expect(isRelevant('無関係な場所', ['台湾鍋', 'おくまん'])).toBe(false);
  });
});
