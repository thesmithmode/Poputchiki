import type { DatePreset, Filters } from "../hooks/useFilters";
import { DEFAULT_FILTERS } from "../hooks/useFilters";
import { type SavedAddress, useSavedAddresses } from "../hooks/useSavedAddresses";
import { AddressAutocomplete, type Coords } from "./AddressAutocomplete";

interface Props {
  filters: Filters;
  onChange: (partial: Partial<Filters>) => void;
  onReset: () => void;
  savedAddresses?: SavedAddress[];
}

export function FiltersPanel({ filters, onChange, onReset, savedAddresses }: Props) {
  const { addresses } = useSavedAddresses();
  const hasActive =
    filters.fromLabel !== DEFAULT_FILTERS.fromLabel ||
    filters.fromLat !== DEFAULT_FILTERS.fromLat ||
    filters.fromLng !== DEFAULT_FILTERS.fromLng ||
    filters.direction !== DEFAULT_FILTERS.direction ||
    filters.priceMin !== DEFAULT_FILTERS.priceMin ||
    filters.priceMax !== DEFAULT_FILTERS.priceMax ||
    filters.seatsMin !== DEFAULT_FILTERS.seatsMin ||
    filters.verifiedOnly !== DEFAULT_FILTERS.verifiedOnly ||
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    return new Date(v).toISOString();
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const routeInputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--brand-surface)",
    color: "var(--brand-text)",
    border: "1px solid var(--brand-line)",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 14,
    boxSizing: "border-box",
  };

  const addressSuggestions = savedAddresses ?? addresses;

  function handleFromChange(value: string, coords?: Coords) {
    onChange({
      fromLabel: value,
      fromLat: coords?.lat ?? null,
      fromLng: coords?.lng ?? null,
    });
  }

  function handleDirectionChange(value: string) {
    onChange({ direction: value });
  }

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

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--brand-sub)", marginBottom: 6 }}>Откуда</div>
          <AddressAutocomplete
            testId="filter-from"
            value={filters.fromLabel}
            onChange={handleFromChange}
            placeholder="Мое местоположение"
            savedAddresses={addressSuggestions}
            showMyLocation
            inputStyle={routeInputStyle}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--brand-sub)", marginBottom: 6 }}>Куда</div>
          <AddressAutocomplete
            testId="filter-direction"
            value={filters.direction}
            onChange={handleDirectionChange}
            placeholder="Адрес назначения"
            savedAddresses={addressSuggestions}
            inputStyle={routeInputStyle}
          />
        </div>
      </div>

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
            type="number"
            min={0}
            max={100}
            placeholder="любое"
            value={filters.seatsMin === 0 ? "" : filters.seatsMin}
            onChange={(e) => {
              const v = e.target.value === "" ? 0 : Number(e.target.value);
              onChange({ seatsMin: Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0 });
            }}
            className="rounded-md px-2 py-1 text-sm w-20"
            style={{
              background: "var(--brand-surface)",
              color: "var(--brand-text)",
              border: "1px solid var(--brand-line)",
            }}
          />
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
