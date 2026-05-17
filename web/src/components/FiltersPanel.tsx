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
    filters.priceMin !== DEFAULT_FILTERS.priceMin ||
    filters.priceMax !== DEFAULT_FILTERS.priceMax ||
    filters.seatsMin !== DEFAULT_FILTERS.seatsMin ||
    filters.verifiedOnly !== DEFAULT_FILTERS.verifiedOnly ||
    filters.favoritesOnly !== DEFAULT_FILTERS.favoritesOnly;

  return (
    <div
      data-testid="filters-panel"
      className="flex flex-col gap-3 px-4 py-3"
      style={{
        background: "var(--brand-surface-2)",
        borderBottom: "1px solid var(--brand-line)",
        color: "var(--brand-text)",
      }}
    >
      <input
        data-testid="filter-direction"
        type="text"
        placeholder="Поиск по направлению"
        value={filters.direction}
        onChange={(e) => onChange({ direction: e.target.value })}
        className="w-full rounded-md px-3 py-1.5 text-sm"
        style={{
          background: "var(--brand-surface)",
          color: "var(--brand-text)",
          border: "1px solid var(--brand-line)",
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Цена, ₽:</span>
        <input
          data-testid="filter-price-min"
          type="number"
          min={0}
          placeholder="от"
          value={filters.priceMin ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            onChange({ priceMin: v });
          }}
          className="rounded-md px-2 py-1 text-sm w-20"
          style={{
            background: "var(--brand-surface)",
            color: "var(--brand-text)",
            border: "1px solid var(--brand-line)",
          }}
        />
        <span className="text-sm">—</span>
        <input
          data-testid="filter-price-max"
          type="number"
          min={0}
          placeholder="до"
          value={filters.priceMax ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            onChange({ priceMax: v });
          }}
          className="rounded-md px-2 py-1 text-sm w-20"
          style={{
            background: "var(--brand-surface)",
            color: "var(--brand-text)",
            border: "1px solid var(--brand-line)",
          }}
        />

        <label className="flex items-center gap-2 text-sm">
          <span>Мест мин:</span>
          <input
            data-testid="filter-seats-min"
            type="range"
            min={0}
            max={20}
            value={filters.seatsMin}
            onChange={(e) => onChange({ seatsMin: Number(e.target.value) })}
            className="w-20"
          />
          <span>{filters.seatsMin === 0 ? "любое" : filters.seatsMin}</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            data-testid="filter-verified"
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(e) => onChange({ verifiedOnly: e.target.checked })}
          />
          Только верифицированные
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
            className="ml-auto text-xs underline"
            style={{ color: "var(--brand-sub)" }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>
    </div>
  );
}
