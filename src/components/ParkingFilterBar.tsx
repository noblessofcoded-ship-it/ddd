import { formatDuration } from '../lib/fee';
import { VEHICLE_PRESETS, findVehicle } from '../lib/vehicle';
import type { ParkingFilters } from '../types';

const WALK_OPTIONS = [200, 300, 500, 800, 1200];
const STAY_OPTIONS = [30, 60, 120, 180, 360, 720];

type Props = {
  filters: ParkingFilters;
  onChange: (filters: ParkingFilters) => void;
};

export function ParkingFilterBar({ filters, onChange }: Props) {
  const patch = (diff: Partial<ParkingFilters>) => onChange({ ...filters, ...diff });

  return (
    <div className="filters">
      <div className="filters__selects">
        <label className="filters__row">
          <span>目的地から</span>
          <select
            className="select"
            value={filters.maxWalkM}
            onChange={(event) => patch({ maxWalkM: Number(event.target.value) })}
          >
            {WALK_OPTIONS.map((meters) => (
              <option key={meters} value={meters}>
                {meters}m以内
              </option>
            ))}
          </select>
        </label>

        <label className="filters__row">
          <span>車種</span>
          <select
            className="select"
            value={filters.vehicle?.label ?? ''}
            onChange={(event) => patch({ vehicle: findVehicle(event.target.value) })}
            title="入れない駐車場を候補から外し、停めやすさの判定にも使います"
          >
            <option value="">指定なし</option>
            {VEHICLE_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.label}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <label className="filters__row">
          <span>駐車時間</span>
          <select
            className="select"
            value={filters.stayMinutes}
            onChange={(event) => patch({ stayMinutes: Number(event.target.value) })}
          >
            {STAY_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDuration(minutes)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="filters__chips">
        <button
          type="button"
          className={`chip ${filters.openNowOnly ? 'chip--on' : ''}`}
          aria-pressed={filters.openNowOnly}
          onClick={() => patch({ openNowOnly: !filters.openNowOnly })}
        >
          今すぐ停められる
        </button>
        <button
          type="button"
          className={`chip ${filters.reliableOnly ? 'chip--on' : ''}`}
          aria-pressed={filters.reliableOnly}
          onClick={() => patch({ reliableOnly: !filters.reliableOnly })}
          title="名称・台数・料金などが登録されている駐車場だけを表示します"
        >
          情報が確かなものだけ
        </button>
        <button
          type="button"
          className={`chip ${filters.freeOnly ? 'chip--on' : ''}`}
          aria-pressed={filters.freeOnly}
          onClick={() => patch({ freeOnly: !filters.freeOnly })}
        >
          無料のみ
        </button>
        <button
          type="button"
          className={`chip ${filters.coveredOnly ? 'chip--on' : ''}`}
          aria-pressed={filters.coveredOnly}
          onClick={() => patch({ coveredOnly: !filters.coveredOnly })}
        >
          屋根あり
        </button>

      </div>
    </div>
  );
}
