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
      style={{
        padding: "12px 16px",
        background: "#f9fafb",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Направление */}
      <input
        data-testid="filter-direction"
        type="text"
        placeholder="Поиск по направлению"
        value={filters.direction}
        onChange={(e) => onChange({ direction: e.target.value })}
        style={{
          width: "100%",
          padding: "6px 10px",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          fontSize: 14,
          boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {/* Цена макс */}
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          Цена макс:&nbsp;
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
            style={{ width: 100 }}
          />
          &nbsp;
          <span>{filters.priceMax === null ? "любая" : `${filters.priceMax} ₽`}</span>
        </label>

        {/* Мест мин */}
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          Мест мин:&nbsp;
          <input
            data-testid="filter-seats-min"
            type="range"
            min={1}
            max={4}
            value={filters.seatsMin}
            onChange={(e) => onChange({ seatsMin: Number(e.target.value) })}
            style={{ width: 80 }}
          />
          &nbsp;
          <span>{filters.seatsMin}</span>
        </label>

        {/* Доверие — минимальный возраст аккаунта */}
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          Возраст акк:&nbsp;
          <input
            data-testid="filter-trust-age"
            type="range"
            min={0}
            max={30}
            value={filters.trustMinAccountAgeDays}
            onChange={(e) => onChange({ trustMinAccountAgeDays: Number(e.target.value) })}
            style={{ width: 80 }}
          />
          &nbsp;
          <span>{filters.trustMinAccountAgeDays === 0 ? "любой" : `${filters.trustMinAccountAgeDays}д`}</span>
        </label>

        {/* Лайки мин */}
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          Лайков мин:&nbsp;
          <input
            data-testid="filter-trust-likes"
            type="range"
            min={0}
            max={10}
            value={filters.trustMinLikes}
            onChange={(e) => onChange({ trustMinLikes: Number(e.target.value) })}
            style={{ width: 80 }}
          />
          &nbsp;
          <span>{filters.trustMinLikes}</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {/* Только верифицированные */}
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            data-testid="filter-verified"
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(e) => onChange({ verifiedOnly: e.target.checked })}
          />
          Только верифицированные
        </label>

        {/* Только избранные */}
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            data-testid="filter-favorites"
            type="checkbox"
            checked={filters.favoritesOnly}
            onChange={(e) => onChange({ favoritesOnly: e.target.checked })}
          />
          Только избранные ♥
        </label>

        {/* Сброс */}
        {hasActive && (
          <button
            data-testid="filter-reset"
            type="button"
            onClick={onReset}
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "#6b7280",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>
    </div>
  );
}
