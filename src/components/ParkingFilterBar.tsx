import type { ParkingFilters } from '../types';

const WALK_OPTIONS = [200, 300, 500, 800, 1200];

type Props = {
  filters: ParkingFilters;
  onChange: (filters: ParkingFilters) => void;
};

export function ParkingFilterBar({ filters, onChange }: Props) {
  const patch = (diff: Partial<ParkingFilters>) => onChange({ ...filters, ...diff });

  return (
    <div className="filters">
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

      <div className="filters__chips">
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
        <button
          type="button"
          className={`chip ${filters.vehicleHeightM !== null ? 'chip--on' : ''}`}
          aria-pressed={filters.vehicleHeightM !== null}
          onClick={() => patch({ vehicleHeightM: filters.vehicleHeightM === null ? 2.1 : null })}
        >
          車高2.1m以上
        </button>
      </div>
    </div>
  );
}
