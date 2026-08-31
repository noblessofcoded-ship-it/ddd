import { useState } from 'react';
import { formatDuration, formatJpy } from '../lib/fee';
import { compassDirection, formatDistance } from '../lib/geo';
import { buildPlaceUrl } from '../lib/googleMaps';
import { limitStatus, type LimitStatus } from '../lib/vehicle';
import { buildFeeSearchUrl } from '../lib/webSearch';
import type { VehicleSize } from '../types';
import type { RankedParking } from '../types';

type Props = {
  lot: RankedParking;
  rank: number;
  selected: boolean;
  /** 見積もりに使っている滞在時間(分) */
  stayMinutes: number;
  onSelect: () => void;
  /** 自分で調べた料金を登録する。空文字なら取り消し */
  onSaveFee: (charge: string) => void;
  /** 検索語に足す地名。目的地の住所を渡す */
  areaHint?: string | null;
  /** 目的地の座標。駐車場がどちら側にあるかを出すのに使う */
  destination?: { lat: number; lng: number } | null;
  /** 選んでいる車種。サイズ制限に余裕があるかの判定に使う */
  vehicle?: VehicleSize | null;
};

/** サイズ制限の 1 項目 */
type Limit = { label: string; limitM: number | null; vehicleM: number | null };

const STATUS_CLASS: Record<LimitStatus, string> = {
  unknown: 'limit--unknown',
  ok: 'limit--ok',
  tight: 'limit--tight',
};

const EASE_TEXT = {
  good: '停めやすい',
  fair: 'ふつう',
  poor: '停めにくい',
} as const;

/** 料金欄の表示。概算が出せるなら金額を、無理なら区分を出す */
function feeLabel(lot: RankedParking): string {
  if (lot.fee === 'free') return '無料';
  if (lot.estimatedFeeJpy !== null) {
    return lot.feeCapped ? `${formatJpy(lot.estimatedFeeJpy)}（最大）` : formatJpy(lot.estimatedFeeJpy);
  }
  return lot.fee === 'paid' ? '有料・料金は未登録' : '料金は未登録';
}

export function ParkingCard({
  lot,
  rank,
  selected,
  stayMinutes,
  onSelect,
  onSaveFee,
  areaHint,
  destination,
  vehicle,
}: Props) {
  const limits: Limit[] = [
    { label: '車高', limitM: lot.maxHeightM, vehicleM: vehicle?.heightM ?? null },
    { label: '車幅', limitM: lot.maxWidthM, vehicleM: vehicle?.widthM ?? null },
    { label: '車長', limitM: lot.maxLengthM, vehicleM: vehicle?.lengthM ?? null },
  ];
  const hasAnyLimit = limits.some((limit) => limit.limitM !== null);
  const showsEstimate = lot.fee !== 'free' && lot.estimatedFeeJpy !== null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lot.feeSource === 'user' ? (lot.feeNote ?? '') : '');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSaveFee(draft);
    setEditing(false);
  };

  return (
    <li className={`card ${selected ? 'card--selected' : ''}`}>
      <div className="card__row">
      <button type="button" className="card__main" onClick={onSelect} aria-pressed={selected}>
        <div className="card__head">
          <span className={`rank ${rank === 1 ? 'rank--top' : ''}`}>{rank}</span>
          <div className="card__title">
            <strong>{lot.name}</strong>
            <span className="card__meta">
              徒歩{lot.walkMinutes}分・{formatDistance(lot.distanceM)}
              {/* 同名の駐車場が並んだときに、どちら側かで見分けられるようにする */}
              {destination && lot.distanceM > 20 && `・目的地の${compassDirection(destination, lot)}`}
            </span>
            {/* 「タイムズ」だけではどの店か分からないので、住所と運営者を添える */}
            {lot.address && <span className="card__meta card__meta--sub">{lot.address}</span>}
            {lot.operator && !lot.name.includes(lot.operator) && (
              <span className="card__meta card__meta--sub">運営：{lot.operator}</span>
            )}
          </div>
          <span className="score" title="おすすめ度">
            {lot.score}
          </span>
        </div>

        <div className="card__fee">
          <strong
            className={[
              'fee',
              lot.fee === 'free' ? 'fee--free' : '',
              lot.estimatedFeeJpy === null && lot.fee !== 'free' ? 'fee--unknown' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {feeLabel(lot)}
          </strong>
          {showsEstimate && <span className="fee__note">{formatDuration(stayMinutes)}の目安</span>}
          {lot.feeSource === 'user' && <span className="badge">自分で登録</span>}
        </div>

        <div className="limits">
          <span className="limits__title">サイズ制限</span>
          {limits.map((limit) => {
            const status = limitStatus(limit.limitM, limit.vehicleM);
            return (
              <span key={limit.label} className={`limit ${STATUS_CLASS[status]}`}>
                {limit.label} {limit.limitM === null ? '記載なし' : `${limit.limitM}m`}
                {status === 'tight' && '（ぎりぎり）'}
              </span>
            );
          })}
        </div>
        {!hasAnyLimit && (
          <p className="limits__note">
            制限が地図データに登録されていないだけで、制限が無いとは限りません。
          </p>
        )}

        <div className="ease">
          <span className={`ease__label ease__label--${lot.easeLevel}`}>
            {EASE_TEXT[lot.easeLevel]}
          </span>
          <span className="ease__notes">{lot.easeNotes.join('・')}</span>
        </div>

        {(lot.openState === 'closed' || lot.exceedsMaxStay || lot.cautions.length > 0) && (
          <ul className="warnings">
            {lot.openState === 'closed' && (
              <li className="warning">現在は営業時間外（{lot.openingHours}）</li>
            )}
            {lot.exceedsMaxStay && lot.maxStayMinutes !== null && (
              <li className="warning">
                最大{formatDuration(lot.maxStayMinutes)}まで（希望より短い）
              </li>
            )}
            {lot.cautions.map((caution) => (
              <li key={caution} className="warning warning--soft">
                {caution}
              </li>
            ))}
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
        // 名前が無いものは既定の文言で検索されてしまうので、座標で開く
        href={buildPlaceUrl(lot, lot.named ? lot.name : undefined)}
        target="_blank"
        rel="noreferrer noopener"
        title="Google マップでこの駐車場を開く"
      >
        地図
      </a>
      </div>

      {editing ? (
        <form className="feeform" onSubmit={submit}>
          <label className="feeform__label" htmlFor={`fee-${lot.id}`}>
            見てきた料金を入力（例：300円/30分 最大1500円）
          </label>
          <div className="feeform__row">
            <input
              id={`fee-${lot.id}`}
              className="input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="300円/30分 最大1500円"
              autoComplete="off"
              autoFocus
            />
            <button type="submit" className="btn btn--primary">
              保存
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
              やめる
            </button>
          </div>
        </form>
      ) : (
        <div className="feeactions">
          <a
            className="feeactions__item"
            href={buildFeeSearchUrl(lot, areaHint)}
            target="_blank"
            rel="noreferrer noopener"
          >
            🔍 料金を調べる
          </a>
          <button
            type="button"
            className="feeactions__item"
            onClick={() => setEditing(true)}
          >
            ✏️ {lot.feeSource === 'user' ? '料金を直す' : '料金を登録'}
          </button>
        </div>
      )}
    </li>
  );
}
