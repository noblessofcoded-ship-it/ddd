/** スワイプで何をするか */
export type SwipeIntent = 'collapse' | 'expand' | null;

/** これ以上動かしたらスワイプとみなす距離（px） */
const SWIPE_THRESHOLD_PX = 40;

/**
 * 縦方向の移動量から、たたむのか開くのかを決める。
 *
 * dy は下向きが正。下に払えばたたみ、上に払えば開く。
 * 閾値に届かない動きは、指が触れただけとみなして何もしない。
 */
export function swipeIntent(dy: number, collapsed: boolean): SwipeIntent {
  if (Math.abs(dy) < SWIPE_THRESHOLD_PX) return null;
  if (dy > 0) return collapsed ? null : 'collapse';
  return collapsed ? 'expand' : null;
}
