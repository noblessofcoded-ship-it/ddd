import { formatDuration, formatJpy } from '../lib/fee';
import { formatDistance } from '../lib/geo';
import { buildPlaceUrl } from '../lib/googleMaps';
import type { RankedParking } from '../types';

type Props = {
  lot: RankedParking;
  rank: number;
  selected: boolean;
  /** 見積もりに使っている滞在時間(分) */
  stayMinutes: number;
  onSelect: () => void;
};

/** 料金欄の表示。概算が出せるなら金額を、無理なら区分を出す */
function feeLabel(lot: RankedParking): string {
  if (lot.fee === 'free') return '無料';
  if (lot.estimatedFeeJpy !== null) {
    return lot.feeCapped ? `${formatJpy(lot.estimatedFeeJpy)}（最大）` : formatJpy(lot.estimatedFeeJpy);
  }
  return lot.fee === 'paid' ? '有料（料金不明）' : '料金不明';
}

export function ParkingCard({ lot, rank, selected, stayMinutes, onSelect }: Props) {
  const showsEstimate = lot.fee !== 'free' && lot.estimatedFeeJpy !== null;

  return (
    <li className={`card ${selected ? 'card--selected' : ''}`}>
      <button type="button" className="card__main" onClick={onSelect} aria-pressed={selected}>
        <div className="card__head">
          <span className={`rank ${rank === 1 ? 'rank--top' : ''}`}>{rank}</span>
          <div className="card__title">
            <strong>{lot.name}</strong>
            <span className="card__meta">
              徒歩{lot.walkMinutes}分・{formatDistance(lot.distanceM)}
            </span>
          </div>
          <span className="score" title="おすすめ度">
            {lot.score}
          </span>
        </div>

        <div className="card__fee">
          <strong className={lot.fee === 'free' ? 'fee fee--free' : 'fee'}>{feeLabel(lot)}</strong>
          {showsEstimate && <span className="fee__note">{formatDuration(stayMinutes)}の目安</span>}
        </div>

        {(lot.openState === 'closed' || lot.exceedsMaxStay) && (
          <ul className="warnings">
            {lot.openState === 'closed' && (
              <li className="warning">現在は営業時間外（{lot.openingHours}）</li>
            )}
            {lot.exceedsMaxStay && lot.maxStayMinutes !== null && (
              <li className="warning">
                最大{formatDuration(lot.maxStayMinutes)}まで（希望より短い）
              </li>
            )}
          </ul>
        )}

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
