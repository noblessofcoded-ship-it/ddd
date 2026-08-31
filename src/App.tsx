import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchNearbyParking, searchRadiusFor } from './api/overpass';
import { fetchNearbyParking as fetchYahooParking } from './api/yahooParking';
import { MapView } from './components/MapView';
import { ParkingCard } from './components/ParkingCard';
import { ParkingFilterBar } from './components/ParkingFilterBar';
import { PlaceSearch } from './components/PlaceSearch';
import { RouteSummary } from './components/RouteSummary';
import { useCurrentLocation } from './hooks/useCurrentLocation';
import { reverseGeocode } from './api/photon';
import { buildPlaceUrl } from './lib/googleMaps';
import { YahooSettings } from './components/YahooSettings';
import { applyFeeNotes, loadFeeNotes, saveFeeNote, type FeeNotes } from './lib/feeStore';
import { mergeParking } from './lib/mergeParking';
import { loadYahooAppId, saveYahooAppId } from './lib/settings';
import { rankParking } from './lib/score';
import { swipeIntent } from './lib/swipe';
import {
  DEFAULT_FILTERS,
  type LatLng,
  type ParkingFilters,
  type ParkingLot,
  type Place,
} from './types';

export default function App() {
  const [destination, setDestination] = useState<Place | null>(null);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [wantsParking, setWantsParking] = useState(true);
  const [filters, setFilters] = useState<ParkingFilters>(DEFAULT_FILTERS);

  const [lots, setLots] = useState<ParkingLot[]>([]);
  // 自分で登録した料金。端末に保存して次回以降も効かせる
  const [feeNotes, setFeeNotes] = useState<FeeNotes>(() => loadFeeNotes());
  // 実際に取得した半径。絞り込みを広げたときに再検索を促すため覚えておく
  const [searchedRadiusM, setSearchedRadiusM] = useState<number | null>(null);
  // どの情報源から何件取れたか。効いているかを画面で確かめられるようにする
  const [sources, setSources] = useState<{
    osm: number;
    yahoo: number;
    combined: number;
    yahooFailed: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pickingOnMap, setPickingOnMap] = useState(false);
  const [yahooAppId, setYahooAppId] = useState<string | null>(() => loadYahooAppId());
  // 下のパネルは地図やカードを隠すので、たためるようにする
  const [footerCollapsed, setFooterCollapsed] = useState(false);
  const dragStartY = useRef<number | null>(null);
  // スワイプの直後には click も飛んでくる。そのまま通すと開閉を打ち消し合う
  const swiped = useRef(false);

  const handleDragStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragStartY.current = event.clientY;
    // スワイプ後に click が飛んでこないこともあるので、押し始めで毎回戻す
    swiped.current = false;
    // 捕捉しないと、指が帯の外に出た時点で pointerup を受け取れなくなる
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const start = dragStartY.current;
    dragStartY.current = null;
    if (start === null) return;

    const intent = swipeIntent(event.clientY - start, footerCollapsed);
    if (!intent) return;

    swiped.current = true;
    setFooterCollapsed(intent === 'collapse');
  };

  const handleHandleClick = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    setFooterCollapsed((collapsed) => !collapsed);
  };
  const currentLocation = useCurrentLocation();

  // 検索の基準点。出発地を決めていなくても、端末の現在地が取れていれば使う
  const searchOrigin = origin ?? currentLocation.place;

  /** 地図をタップして目的地を決める。地名は分かれば添える */
  const handlePick = useCallback(async (point: LatLng) => {
    setPickingOnMap(false);
    const fallbackPlace: Place = {
      id: `pin:${point.lat.toFixed(6)},${point.lng.toFixed(6)}`,
      name: '地図で指定した地点',
      address: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      lat: point.lat,
      lng: point.lng,
    };

    setDestination(fallbackPlace);
    try {
      const resolved = await reverseGeocode(point);
      if (resolved) setDestination(resolved);
    } catch {
      // 地名が引けなくても座標は確定しているので、そのまま進める
    }
  }, []);

  useEffect(() => {
    if (currentLocation.place) setOrigin(currentLocation.place);
  }, [currentLocation.place]);

  // 検索は明示的にボタンを押したときだけ走らせる
  const requestRef = useRef<AbortController | null>(null);
  const [searched, setSearched] = useState(false);

  const searchParking = useCallback(async (target: Place, maxWalkM: number) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    const radius = searchRadiusFor(maxWalkM);
    setLoading(true);
    setError(null);

    try {
      // 片方が落ちても、もう片方の結果で案内は続けられるようにする
      let yahooFailed = false;
      const [osmLots, yahooLots] = await Promise.all([
        fetchNearbyParking(target, radius, { signal: controller.signal }),
        fetchYahooParking(target, radius, yahooAppId, { signal: controller.signal }).catch(() => {
          yahooFailed = true;
          return [];
        }),
      ]);
      if (controller.signal.aborted) return;

      const merged = mergeParking(osmLots, yahooLots);
      setLots(merged.lots);
      setSources({
        osm: osmLots.length,
        yahoo: yahooLots.length,
        combined: merged.combined,
        yahooFailed,
      });
      setSearchedRadiusM(radius);
      setSearched(true);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : '駐車場を取得できませんでした');
      setLots([]);
      setSearched(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [yahooAppId]);

  // 目的地やレコメンドの ON/OFF が変わったら、前回の検索結果は捨てる
  useEffect(() => {
    requestRef.current?.abort();
    setLots([]);
    setSelectedId(null);
    setSearched(false);
    setError(null);
    setSources(null);
  }, [destination, wantsParking]);

  // 営業状態は時刻に依存するので、1 分ごとに評価し直す
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const ranked = useMemo(
    () => rankParking(applyFeeNotes(lots, feeNotes), filters, { now }),
    [lots, feeNotes, filters, now],
  );

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

  // 料金が分かっている件数。未登録が多い現実を隠さず伝えるために出す
  const knownFeeCount = ranked.filter((lot) => lot.estimatedFeeJpy !== null).length;

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
            near={searchOrigin}
            yahooAppId={yahooAppId}
            locationPrompt={
              searchOrigin ? null : (
                <p className="hint">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={currentLocation.request}
                    disabled={currentLocation.loading}
                  >
                    {currentLocation.loading ? '取得中…' : '現在地を使う'}
                  </button>
                  近くの店を優先して探せます
                </p>
              )
            }
            fallback={(query) => (
              <div className="notfound__actions">
                {!searchOrigin && (
                  <button
                    type="button"
                    className="btn btn--primary notfound__wide"
                    onClick={currentLocation.request}
                    disabled={currentLocation.loading}
                  >
                    {currentLocation.loading ? '取得中…' : '現在地を使って探し直す'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setPickingOnMap(true)}
                >
                  地図から指定する
                </button>
                <a
                  className="btn btn--ghost"
                  href={buildPlaceUrl(searchOrigin ?? { lat: 35.681236, lng: 139.767125 }, query)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Google マップで探す
                </a>
              </div>
            )}
          />

          <PlaceSearch
            label="出発地（任意）"
            placeholder="未入力なら Google マップの現在地"
            selected={origin}
            near={searchOrigin}
            yahooAppId={yahooAppId}
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

          <YahooSettings
            appId={yahooAppId}
            onChange={(next) => setYahooAppId(saveYahooAppId(next))}
          />

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

        {pickingOnMap && (
          <section className="banner">
            <p>地図をタップして目的地を指定してください。</p>
            <button type="button" className="btn btn--ghost" onClick={() => setPickingOnMap(false)}>
              やめる
            </button>
          </section>
        )}

        {!destination && !pickingOnMap && (
          <section className="empty">
            <p>まず目的地を検索してください。</p>
            <p className="empty__note">
              例：「渋谷ヒカリエ」「イオンモール幕張新都心」「東京都庁」
            </p>
          </section>
        )}

        {(destination || pickingOnMap) && (
          <MapView
            destination={destination}
            origin={origin}
            lots={wantsParking ? ranked : []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPick={pickingOnMap ? handlePick : undefined}
          />
        )}

        {destination && wantsParking && (
          <section className="panel">
            <ParkingFilterBar filters={filters} onChange={setFilters} />

            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => void searchParking(destination, filters.maxWalkM)}
              disabled={loading}
            >
              {loading ? '検索中…' : searched ? 'この条件で再検索' : '周辺の駐車場を検索'}
            </button>

            {error && (
              <p className="hint hint--error">
                {error}
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void searchParking(destination, filters.maxWalkM)}
                >
                  再試行
                </button>
              </p>
            )}

            {searched &&
              searchedRadiusM !== null &&
              searchRadiusFor(filters.maxWalkM) > searchedRadiusM && (
                <p className="hint hint--error">
                  検索したときより範囲を広げています。「この条件で再検索」を押してください。
                </p>
              )}

            {searched && !loading && !error && ranked.length === 0 && (
              <p className="hint">
                条件に合う駐車場が見つかりませんでした。徒歩距離を広げるか、絞り込みを外してみてください。
              </p>
            )}

            {sources && (
              <p className="sources">
                情報源：地図データ {sources.osm}件
                {yahooAppId
                  ? ` ／ Yahoo! ${sources.yahoo}件`
                  : ' ／ Yahoo! 未設定（「店舗の検索精度を上げる」から設定できます）'}
                {sources.combined > 0 && `（うち${sources.combined}件は同じ駐車場として統合）`}
                {sources.yahooFailed && ' ／ Yahoo! は応答しませんでした'}
              </p>
            )}

            {ranked.length > 0 && knownFeeCount < ranked.length && (
              <p className="coverage">
                料金が分かるのは {ranked.length} 件中 {knownFeeCount} 件です。
                OpenStreetMap に料金が登録されていない駐車場が多いため、
                残りは各カードの「料金を確認」から Google マップでご確認ください。
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
                    onSaveFee={(charge) => setFeeNotes((notes) => saveFeeNote(notes, lot.id, charge))}
                    areaHint={destination.address}
                    destination={destination}
                    vehicle={filters.vehicle}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {destination && (
        <footer className={`footer ${footerCollapsed ? 'footer--collapsed' : ''}`}>
          <button
            type="button"
            className="footer__handle"
            onPointerDown={handleDragStart}
            onPointerUp={handleDragEnd}
            onClick={handleHandleClick}
            aria-expanded={!footerCollapsed}
            aria-label={footerCollapsed ? 'ルートを開く' : 'ルートをたたむ'}
          >
            <span className="footer__grip" aria-hidden="true" />
            {footerCollapsed && (
              <span className="footer__peek">
                {wantsParking && selectedParking
                  ? `${selectedParking.name} に駐車`
                  : `${destination.name} まで`}
              </span>
            )}
          </button>

          <div className="footer__body" hidden={footerCollapsed}>
          <RouteSummary
            origin={origin}
            destination={destination}
            parking={wantsParking ? selectedParking : null}
            stayMinutes={filters.stayMinutes}
          />
          </div>
        </footer>
      )}
    </div>
  );
}
