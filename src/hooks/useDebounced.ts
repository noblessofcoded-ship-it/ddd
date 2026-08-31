import { useEffect, useState } from 'react';

/** 値の変化を delay ミリ秒だけ遅らせて返す。API の呼びすぎを防ぐ */
export function useDebounced<T>(value: T, delay = 500): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
