import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../api/placeSearch';
import { distanceMeters, formatDistance } from '../lib/geo';
import { useDebounced } from '../hooks/useDebounced';
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
  /** 現在地が未設定のときに出す案内 */
  locationPrompt?: React.ReactNode;
};

type SearchState = {
  places: Place[];
  triedQueries: string[];
  relaxed: boolean;
  searched: boolean;
};

const EMPTY: SearchState = { places: [], triedQueries: [], relaxed: false, searched: false };

/** 検索を始める最短の文字数。1 文字だと候補が多すぎて役に立たない */
const MIN_QUERY_LENGTH = 2;

export function PlaceSearch({
  label,
  placeholder,
  selected,
  onSelect,
  onClear,
  near = null,
  action,
  fallback,
  locationPrompt,
}: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 入力中の反応を良くするため、間隔は短めに取る
  const debouncedQuery = useDebounced(query, 300);

  // 入力が落ち着いたら自動で検索する
  useEffect(() => {
    if (selected || normalizeQuery(debouncedQuery).length < MIN_QUERY_LENGTH) {
      setState(EMPTY);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    searchPlaces(debouncedQuery, {
      signal: controller.signal,
      near,
      // 速い経路の結果を先に描き、時間のかかる再検索の結果は後から差し替える
      onPartial: (partial) => {
        if (!controller.signal.aborted) setState({ ...partial, searched: true });
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setState({ ...result, searched: true });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : '検索に失敗しました');
        setState(EMPTY);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, selected, near]);

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

      {loading && state.places.length === 0 && <p className="hint">検索中…</p>}
      {error && <p className="hint hint--error">{error}</p>}
      {locationPrompt}

      {state.relaxed && state.places.length > 0 && (
        <p className="hint">
          入力どおりでは見つからなかったため、条件を緩めて探しました
        </p>
      )}

      {state.places.length > 0 && (
        <ul className={`results ${loading ? 'results--stale' : ''}`}>
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
            {near
              ? 'この地図データ（OpenStreetMap）に登録されていない店舗の可能性があります。店名を短くするか、近くの目印になる建物や交差点で探してみてください。'
              : '現在地を設定すると、地図データの店名を直接たどる検索まで試せます。それでも見つからない場合は、登録されていない店舗の可能性があります。'}
          </p>
          {fallback?.(normalizeQuery(query))}
        </div>
      )}
    </div>
  );
}
