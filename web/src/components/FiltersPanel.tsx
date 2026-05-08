import type { Filters } from "../hooks/useFilters";
import { DEFAULT_FILTERS } from "../hooks/useFilters";

interface Props {
  filters: Filters;
  onChange: (partial: Partial<Filters>) => void;
  onReset: () => void;
}

export function FiltersPanel({ filters, onChange, onReset }: Props) {
  const hasActive =
    filters.direction !== DEFAULT_FILTERS.direction ||
    filters.priceMax !== DEFAULT_FILTERS.priceMax ||
    filters.seatsMin !== DEFAULT_FILTERS.seatsMin ||
    filters.verifiedOnly !== DEFAULT_FILTERS.verifiedOnly ||
    filters.favoritesOnly !== DEFAULT_FILTERS.favoritesOnly ||
    filters.trustMinAccountAgeDays !== DEFAULT_FILTERS.trustMinAccountAgeDays ||
    filters.trustMinLikes !== DEFAULT_FILTERS.trustMinLikes;

  return (
    <div
      data-testid="filters-panel"
      className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3"
    >
      <input
        data-testid="filter-direction"
        type="text"
        placeholder="Поиск по направлению"
        value={filters.direction}
        onChange={(e) => onChange({ direction: e.target.value })}
        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      />

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span>Цена макс:</span>
          <input
            data-testid="filter-price-max"
            type="range"
            min={0}
            max={2000}
            step={50}
            value={filters.priceMax ?? 2000}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange({ priceMax: v >= 2000 ? null : v });
            }}
            className="w-24"
          />
          <span>{filters.priceMax === null ? "любая" : `${filters.priceMax} ₽`}</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span>Мест мин:</span>
          <input
            data-testid="filter-seats-min"
            type="range"
            min={0}
            max={4}
            value={filters.seatsMin}
            onChange={(e) => onChange({ seatsMin: Number(e.target.value) })}
            className="w-20"
          />
          <span>{filters.seatsMin === 0 ? "любое" : filters.seatsMin}</span>
        </label>

        <label
          className="flex items-center gap-2 text-sm opacity-40"
          title="Скоро: требует данных водителя"
        >
          <span>Возраст акк:</span>
          <input
            data-testid="filter-trust-age"
            type="range"
            min={0}
            max={30}
            disabled
            value={filters.trustMinAccountAgeDays}
            onChange={(e) => onChange({ trustMinAccountAgeDays: Number(e.target.value) })}
            className="w-20"
          />
          <span className="text-xs text-gray-400">скоро</span>
        </label>

        <label
          className="flex items-center gap-2 text-sm opacity-40"
          title="Скоро: требует данных водителя"
        >
          <span>Лайков мин:</span>
          <input
            data-testid="filter-trust-likes"
            type="range"
            min={0}
            max={10}
            disabled
            value={filters.trustMinLikes}
            onChange={(e) => onChange({ trustMinLikes: Number(e.target.value) })}
            className="w-20"
          />
          <span className="text-xs text-gray-400">скоро</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label
          className="flex items-center gap-2 text-sm opacity-40"
          title="Скоро: требует данных водителя"
        >
          <input
            data-testid="filter-verified"
            type="checkbox"
            disabled
            checked={filters.verifiedOnly}
            onChange={(e) => onChange({ verifiedOnly: e.target.checked })}
          />
          Только верифицированные (скоро)
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            data-testid="filter-favorites"
            type="checkbox"
            checked={filters.favoritesOnly}
            onChange={(e) => onChange({ favoritesOnly: e.target.checked })}
          />
          Только избранные ♥
        </label>

        {hasActive && (
          <button
            data-testid="filter-reset"
            type="button"
            onClick={onReset}
            className="ml-auto text-xs text-gray-500 underline"
          >
            Сбросить фильтры
          </button>
        )}
      </div>
    </div>
  );
}
