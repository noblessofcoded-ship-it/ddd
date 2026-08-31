import { describe, expect, it } from 'vitest';
import { swipeIntent } from './swipe';

describe('swipeIntent', () => {
  it('下に払うとたたむ', () => {
    expect(swipeIntent(60, false)).toBe('collapse');
  });

  it('上に払うと開く', () => {
    expect(swipeIntent(-60, true)).toBe('expand');
  });

  it('すでにその状態なら何もしない', () => {
    expect(swipeIntent(60, true)).toBeNull();
    expect(swipeIntent(-60, false)).toBeNull();
  });

  it('少し動いただけでは反応しない', () => {
    // 指が触れただけで勝手にたたまれると使いにくい
    expect(swipeIntent(20, false)).toBeNull();
    expect(swipeIntent(-20, true)).toBeNull();
    expect(swipeIntent(0, false)).toBeNull();
  });
});
