import type { DatePreset, Filters } from "../hooks/useFilters";
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
    filters.favoritesOnly !== DEFAULT_FILTERS.favoritesOnly ||
    filters.hideMyRides !== DEFAULT_FILTERS.hideMyRides ||
    filters.datePreset !== DEFAULT_FILTERS.datePreset ||
    filters.fromAt !== DEFAULT_FILTERS.fromAt ||
    filters.toAt !== DEFAULT_FILTERS.toAt;

  const DATE_PRESETS: { id: DatePreset; label: string }[] = [
    { id: "24h", label: "1 день" },
    { id: "48h", label: "2 дня" },
    { id: "7d", label: "7 дней" },
    { id: null, label: "Любой" },
  ];

  function toLocalDateValue(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fromLocalDateValue(v: string): string | null {
    if (!v) return null;
    return new Date(v).toISOString();
  }

  const todayIso = new Date().toISOString().slice(0, 10);

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
      {/* Date range */}
      <div>
        <div style={{ fontSize: 12, color: "var(--brand-sub)", marginBottom: 6 }}>Период</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {DATE_PRESETS.map((p) => {
            const active = filters.datePreset === p.id;
            return (
              <button
                key={String(p.id)}
                type="button"
                onClick={() => onChange({ datePreset: p.id, fromAt: null, toAt: null })}
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: "none",
                  background: active ? "var(--brand-primary)" : "var(--brand-surface)",
                  color: active ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input
            data-testid="filter-from-at"
            type="date"
            value={toLocalDateValue(filters.fromAt) || todayIso}
            onChange={(e) =>
              onChange({ fromAt: fromLocalDateValue(e.target.value), datePreset: "custom" })
            }
            className="rounded-md px-2 py-1 text-sm"
            style={{
              background: "var(--brand-surface)",
              color: "var(--brand-text)",
              border: "1px solid var(--brand-line)",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--brand-sub)" }}>—</span>
          <input
            data-testid="filter-to-at"
            type="date"
            value={toLocalDateValue(filters.toAt)}
            onChange={(e) =>
              onChange({ toAt: fromLocalDateValue(e.target.value), datePreset: "custom" })
            }
            className="rounded-md px-2 py-1 text-sm"
            style={{
              background: "var(--brand-surface)",
              color: "var(--brand-text)",
              border: "1px solid var(--brand-line)",
            }}
          />
        </div>
      </div>

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

        <label className="flex items-center gap-2 text-sm">
          <input
            data-testid="filter-hide-my-rides"
            type="checkbox"
            checked={filters.hideMyRides}
            onChange={(e) => onChange({ hideMyRides: e.target.checked })}
          />
          Скрыть мои поездки
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
