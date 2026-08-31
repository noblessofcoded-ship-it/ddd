import { describe, expect, it } from 'vitest';
import { buildQueryVariants, normalizeQuery, tokenize } from './query';

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
