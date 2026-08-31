import { useRef, useState } from 'react';
import { searchPlaces } from '../api/placeSearch';
import { distanceMeters, formatDistance } from '../lib/geo';
import { normalizeQuery } from '../lib/query';
import type { LatLng, Place } from '../types';

type Props = {
  label: string;
  placeholder: string;
  selected: Place | null;
  onSelect: (place: Place) => void;
  onClear: () => void;
  /** 現在地。指定すると近い順に並べ替え、周辺を優先して検索する */
  near?: LatLng | null;
  /** 入力欄の右に置く補助ボタン（現在地取得など） */
  action?: React.ReactNode;
  /** 見つからなかったときに出す代替手段。検索した語を受け取る */
  fallback?: (query: string) => React.ReactNode;
};

type SearchState = {
  places: Place[];
  matchedQuery: string;
  relaxed: boolean;
  searched: boolean;
};

const EMPTY: SearchState = { places: [], matchedQuery: '', relaxed: false, searched: false };

export function PlaceSearch({
  label,
  placeholder,
  selected,
  onSelect,
  onClear,
  near = null,
  action,
  fallback,
}: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  const canSearch = normalizeQuery(query).length >= 1;

  const runSearch = async () => {
    if (!canSearch || loading) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await searchPlaces(query, { signal: controller.signal, near });
      if (controller.signal.aborted) return;
      setState({ ...result, searched: true });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : '検索に失敗しました');
      setState(EMPTY);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const handleSelect = (place: Place) => {
    onSelect(place);
    setQuery('');
    setState(EMPTY);
  };

  const handleClear = () => {
    onClear();
    setQuery('');
    setState(EMPTY);
    setError(null);
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

      <form
        className="field__row"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <input
          ref={inputRef}
          type="search"
          className="input"
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setState(EMPTY);
          }}
          autoComplete="off"
          enterKeyHint="search"
        />
        {action}
        <button type="submit" className="btn btn--search" disabled={!canSearch || loading}>
          {loading ? '検索中' : '検索'}
        </button>
      </form>

      {near && !state.searched && <p className="hint">現在地に近い順で探します</p>}
      {error && <p className="hint hint--error">{error}</p>}

      {state.relaxed && (
        <p className="hint">
          入力どおりでは見つからず、「{state.matchedQuery}」で検索した結果です
        </p>
      )}

      {state.searched && state.places.length > 0 && (
        <ul className="results">
          {state.places.map((place) => (
            <li key={place.id}>
              <button type="button" className="results__item" onClick={() => handleSelect(place)}>
                <strong>{place.name}</strong>
                <span>
                  {near && `${formatDistance(distanceMeters(near, place))}・`}
                  {place.address || '住所情報なし'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.searched && !loading && state.places.length === 0 && !error && (
        <div className="notfound">
          <p className="notfound__title">見つかりませんでした</p>
          <p className="notfound__body">
            この地図データ（OpenStreetMap）に登録されていない店舗の可能性があります。
            店名を短くするか、近くの目印になる建物や交差点で探してみてください。
          </p>
          {fallback?.(state.matchedQuery)}
        </div>
      )}
    </div>
  );
}
