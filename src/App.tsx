import { useEffect, useMemo, useState } from 'react';
import { fetchNearbyParking } from './api/overpass';
import { MapView } from './components/MapView';
import { ParkingCard } from './components/ParkingCard';
import { ParkingFilterBar } from './components/ParkingFilterBar';
import { PlaceSearch } from './components/PlaceSearch';
import { RouteSummary } from './components/RouteSummary';
import { useCurrentLocation } from './hooks/useCurrentLocation';
import { rankParking } from './lib/score';
import { DEFAULT_FILTERS, type ParkingFilters, type ParkingLot, type Place } from './types';

/** Overpass を叩く半径。フィルタの上限より広く取り、絞り込みは手元で行う */
const SEARCH_RADIUS_M = 1500;

export default function App() {
  const [destination, setDestination] = useState<Place | null>(null);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [wantsParking, setWantsParking] = useState(true);
  const [filters, setFilters] = useState<ParkingFilters>(DEFAULT_FILTERS);

  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const currentLocation = useCurrentLocation();

  useEffect(() => {
    if (currentLocation.place) setOrigin(currentLocation.place);
  }, [currentLocation.place]);

  // 目的地が決まり、かつレコメンドが ON のときだけ駐車場を取りに行く
  useEffect(() => {
    if (!destination || !wantsParking) {
      setLots([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchNearbyParking(destination, SEARCH_RADIUS_M, { signal: controller.signal })
      .then(setLots)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : '駐車場を取得できませんでした');
        setLots([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [destination, wantsParking]);

  // 営業状態は時刻に依存するので、1 分ごとに評価し直す
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const ranked = useMemo(() => rankParking(lots, filters, { now }), [lots, filters, now]);

  // 絞り込みで消えた駐車場が選ばれたままにならないようにする
  useEffect(() => {
    if (selectedId && !ranked.some((lot) => lot.id === selectedId)) {
      setSelectedId(null);
    }
  }, [ranked, selectedId]);

  // 候補が出たら 1 位を初期選択にして、そのままナビへ進めるようにする
  useEffect(() => {
    if (!selectedId && ranked.length > 0) setSelectedId(ranked[0].id);
  }, [ranked, selectedId]);

  const selectedParking = ranked.find((lot) => lot.id === selectedId) ?? null;

  const handleReset = () => {
    setDestination(null);
    setLots([]);
    setSelectedId(null);
    setError(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="header__title">パーキングルート</h1>
        <p className="header__sub">目的地の近くの駐車場を選んで、Google マップに引き渡します</p>
      </header>

      <main className="main">
        <section className="panel">
          <PlaceSearch
            label="目的地"
            placeholder="店名・施設名・住所で検索"
            selected={destination}
            onSelect={setDestination}
            onClear={handleReset}
          />

          <PlaceSearch
            label="出発地（任意）"
            placeholder="未入力なら Google マップの現在地"
            selected={origin}
            onSelect={setOrigin}
            onClear={() => {
              setOrigin(null);
              currentLocation.clear();
            }}
            action={
              <button
                type="button"
                className="btn btn--ghost"
                onClick={currentLocation.request}
                disabled={currentLocation.loading}
              >
                {currentLocation.loading ? '取得中…' : '現在地'}
              </button>
            }
          />
          {currentLocation.error && <p className="hint hint--error">{currentLocation.error}</p>}

          <label className="toggle">
            <input
              type="checkbox"
              checked={wantsParking}
              onChange={(event) => {
                setWantsParking(event.target.checked);
                setSelectedId(null);
              }}
            />
            <span className="toggle__track" aria-hidden="true">
              <span className="toggle__thumb" />
            </span>
            <span className="toggle__text">
              <strong>駐車場をおすすめする</strong>
              <span>OFF にすると目的地まで直行のルートになります</span>
            </span>
          </label>
        </section>

        {!destination && (
          <section className="empty">
            <p>まず目的地を検索してください。</p>
            <p className="empty__note">
              例：「渋谷ヒカリエ」「イオンモール幕張新都心」「東京都庁」
            </p>
          </section>
        )}

        {destination && (
          <MapView
            destination={destination}
            origin={origin}
            lots={wantsParking ? ranked : []}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}

        {destination && wantsParking && (
          <section className="panel">
            <ParkingFilterBar filters={filters} onChange={setFilters} />

            {loading && <p className="hint">周辺の駐車場を検索中…</p>}
            {error && (
              <p className="hint hint--error">
                {error}
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setDestination({ ...destination })}
                >
                  再試行
                </button>
              </p>
            )}

            {!loading && !error && ranked.length === 0 && (
              <p className="hint">
                条件に合う駐車場が見つかりませんでした。徒歩距離を広げるか、絞り込みを外してみてください。
              </p>
            )}

            {ranked.length > 0 && (
              <ul className="cards">
                {ranked.map((lot, index) => (
                  <ParkingCard
                    key={lot.id}
                    lot={lot}
                    rank={index + 1}
                    selected={lot.id === selectedId}
                    stayMinutes={filters.stayMinutes}
                    onSelect={() => setSelectedId(lot.id)}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {destination && (
        <footer className="footer">
          <RouteSummary
            origin={origin}
            destination={destination}
            parking={wantsParking ? selectedParking : null}
            stayMinutes={filters.stayMinutes}
          />
        </footer>
      )}
    </div>
  );
}
