import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../api/nominatim';
import { useDebounced } from '../hooks/useDebounced';
import type { Place } from '../types';

type Props = {
  label: string;
  placeholder: string;
  selected: Place | null;
  onSelect: (place: Place) => void;
  onClear: () => void;
  /** 入力欄の右に置く補助ボタン（現在地取得など） */
  action?: React.ReactNode;
};

export function PlaceSearch({ label, placeholder, selected, onSelect, onClear, action }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebounced(query, 500);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selected || debouncedQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    searchPlaces(debouncedQuery, { signal: controller.signal })
      .then(setResults)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : '検索に失敗しました');
        setResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, selected]);

  const handleSelect = (place: Place) => {
    onSelect(place);
    setQuery('');
    setResults([]);
  };

  const handleClear = () => {
    onClear();
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  if (selected) {
    return (
      <div className="field">
        <span className="field__label">{label}</span>
        <div className="chosen">
          <div className="chosen__text">
            <strong>{selected.name}</strong>
            {selected.address && <span>{selected.address}</span>}
          </div>
          <button type="button" className="btn btn--ghost" onClick={handleClear}>
            変更
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="field__row">
        <input
          ref={inputRef}
          type="search"
          className="input"
          value={query}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
        {action}
      </div>

      {loading && <p className="hint">検索中…</p>}
      {error && <p className="hint hint--error">{error}</p>}
      {!loading && !error && debouncedQuery.trim().length >= 2 && results.length === 0 && (
        <p className="hint">該当する場所が見つかりませんでした</p>
      )}

      {results.length > 0 && (
        <ul className="results">
          {results.map((place) => (
            <li key={place.id}>
              <button type="button" className="results__item" onClick={() => handleSelect(place)}>
                <strong>{place.name}</strong>
                <span>{place.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
