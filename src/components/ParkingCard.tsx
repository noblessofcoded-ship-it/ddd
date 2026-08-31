import { formatDistance } from '../lib/geo';
import { buildPlaceUrl } from '../lib/googleMaps';
import type { RankedParking } from '../types';

const FEE_LABEL: Record<RankedParking['fee'], string> = {
  free: '無料',
  paid: '有料',
  unknown: '料金不明',
};

type Props = {
  lot: RankedParking;
  rank: number;
  selected: boolean;
  onSelect: () => void;
};

export function ParkingCard({ lot, rank, selected, onSelect }: Props) {
  return (
    <li className={`card ${selected ? 'card--selected' : ''}`}>
      <button type="button" className="card__main" onClick={onSelect} aria-pressed={selected}>
        <div className="card__head">
          <span className={`rank ${rank === 1 ? 'rank--top' : ''}`}>{rank}</span>
          <div className="card__title">
            <strong>{lot.name}</strong>
            <span className="card__meta">
              徒歩{lot.walkMinutes}分・{formatDistance(lot.distanceM)}・{FEE_LABEL[lot.fee]}
            </span>
          </div>
          <span className="score" title="おすすめ度">
            {lot.score}
          </span>
        </div>

        {lot.reasons.length > 0 && (
          <ul className="tags">
            {lot.reasons.map((reason) => (
              <li key={reason} className="tag">
                {reason}
              </li>
            ))}
          </ul>
        )}
      </button>

      <a
        className="card__link"
        href={buildPlaceUrl(lot, lot.name)}
        target="_blank"
        rel="noreferrer noopener"
      >
        詳細
      </a>
    </li>
  );
}
