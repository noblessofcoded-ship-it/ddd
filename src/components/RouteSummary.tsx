import { formatDuration, formatJpy } from '../lib/fee';
import { formatDistance } from '../lib/geo';
import { buildDirectionsUrl, buildWalkUrl } from '../lib/googleMaps';
import type { Place, RankedParking } from '../types';

type Props = {
  origin: Place | null;
  destination: Place;
  parking: RankedParking | null;
  /** 料金の見積もりに使っている滞在時間(分) */
  stayMinutes: number;
};

/** 駐車の行に添える料金の説明 */
function parkingNote(parking: RankedParking, stayMinutes: number): string {
  if (parking.fee === 'free') return '無料';
  if (parking.estimatedFeeJpy === null) return `おすすめ度 ${parking.score}`;
  return parking.feeCapped
    ? `${formatJpy(parking.estimatedFeeJpy)}（最大料金）`
    : `${formatDuration(stayMinutes)}で${formatJpy(parking.estimatedFeeJpy)}`;
}

/** ルート確定後、Google マップへ引き渡すためのパネル */
export function RouteSummary({ origin, destination, parking, stayMinutes }: Props) {
  const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

  const originLabel = origin ? origin.name : '現在地（Google マップ側で取得）';

  if (!parking) {
    return (
      <section className="summary">
        <ol className="legs">
          <li className="leg">
            <span className="leg__icon">🚗</span>
            <div>
              <strong>{originLabel}</strong>
              <span>から</span>
            </div>
          </li>
          <li className="leg">
            <span className="leg__icon">📍</span>
            <div>
              <strong>{destination.name}</strong>
              <span>まで直行</span>
            </div>
          </li>
        </ol>

        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() =>
            open(
              buildDirectionsUrl({
                origin,
                destination,
                parking: null,
                mode: 'direct',
                navigate: true,
              }),
            )
          }
        >
          Google マップでナビを開始
        </button>
      </section>
    );
  }

  return (
    <section className="summary">
      <ol className="legs">
        <li className="leg">
          <span className="leg__icon">🚗</span>
          <div>
            <strong>{originLabel}</strong>
            <span>から車で</span>
          </div>
        </li>
        <li className="leg">
          <span className="leg__icon">🅿️</span>
          <div>
            <strong>{parking.name}</strong>
            <span>に駐車・{parkingNote(parking, stayMinutes)}</span>
          </div>
        </li>
        <li className="leg">
          <span className="leg__icon">🚶</span>
          <div>
            <strong>{destination.name}</strong>
            <span>
              まで徒歩{parking.walkMinutes}分・{formatDistance(parking.distanceM)}
            </span>
          </div>
        </li>
      </ol>

      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={() =>
          open(
            buildDirectionsUrl({
              origin,
              destination,
              parking,
              mode: 'to-parking',
              navigate: true,
            }),
          )
        }
      >
        駐車場までナビを開始
      </button>

      <div className="summary__secondary">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => open(buildWalkUrl(parking, destination))}
        >
          🚶 駐車場からの徒歩ルート
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() =>
            open(
              buildDirectionsUrl({ origin, destination, parking, mode: 'via-parking' }),
            )
          }
        >
          🗺 駐車場を経由地にして開く
        </button>
      </div>
    </section>
  );
}
