import { useState } from "react";
import { FiltersPanel } from "../components/FiltersPanel";
import { Icon } from "../components/Icon";
import { useFilters } from "../hooks/useFilters";
import { FeedView } from "../views/FeedView";
import { MapScreen } from "./MapScreen";

type ViewMode = "list" | "map";

function pluralRides(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "поездок";
  if (mod10 === 1) return "поездка";
  if (mod10 >= 2 && mod10 <= 4) return "поездки";
  return "поездок";
}

const VIEW_MODE_KEY = "pp_view_mode";
const DENSITY_KEY = "pp_density";

function loadViewMode(): ViewMode {
  const v = localStorage.getItem(VIEW_MODE_KEY);
  return v === "map" ? "map" : "list";
}

export function RidesScreen() {
  const { filters, setFilters, resetFilters } = useFilters();
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [density, setDensity] = useState<"compact" | "cozy">(
    () => (localStorage.getItem(DENSITY_KEY) as "compact" | "cozy") ?? "cozy",
  );
  const [showFilters, setShowFilters] = useState(false);
  const [ridesCount, setRidesCount] = useState<number | null>(null);

  const trustOn =
    filters.trustMinAccountAgeDays > 0 ||
    filters.trustMinLikes > 0 ||
    filters.favoritesOnly ||
    filters.verifiedOnly;

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  function toggleDensity() {
    const next = density === "compact" ? "cozy" : "compact";
    setDensity(next);
    localStorage.setItem(DENSITY_KEY, next);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: "var(--brand-bg)",
        overflow: "hidden",
      }}
    >
      {/* Shared header */}
      <div
        style={{
          position: "relative",
          zIndex: 20,
          background: "var(--brand-surface)",
          borderBottom: "1px solid var(--brand-line)",
          padding: "8px 16px 10px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--brand-sub)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 2,
              }}
            >
              ЖК Царёво · Попутчики
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--brand-text)",
                letterSpacing: -0.4,
                lineHeight: 1.2,
              }}
            >
              {ridesCount !== null ? `${ridesCount} ${pluralRides(ridesCount)}` : "Поездки"}
            </div>
          </div>

          {/* Filter button */}
          <button
            type="button"
            data-testid="toggle-filters"
            onClick={() => setShowFilters((v) => !v)}
            aria-label="Фильтры"
            aria-pressed={showFilters}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: "none",
              background:
                trustOn || showFilters ? "var(--brand-primary)" : "var(--brand-surface-2)",
              color:
                trustOn || showFilters ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: trustOn || showFilters ? "none" : "var(--shadow-sm)",
            }}
          >
            <Icon name="filter" size={18} />
          </button>

          {/* Density toggle — only in list mode */}
          {viewMode === "list" && (
            <button
              type="button"
              data-testid="toggle-density"
              onClick={toggleDensity}
              aria-label={density === "compact" ? "Уютный вид" : "Компактный вид"}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: "none",
                background:
                  density === "compact" ? "var(--brand-primary)" : "var(--brand-surface-2)",
                color:
                  density === "compact" ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: density === "compact" ? "none" : "var(--shadow-sm)",
              }}
            >
              <Icon name={density === "compact" ? "list" : "grid"} size={16} />
            </button>
          )}

          {/* View mode toggle: list / map */}
          <button
            type="button"
            data-testid="toggle-view-list"
            aria-label="Список"
            onClick={() => switchView("list")}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: "none",
              background: viewMode === "list" ? "var(--brand-primary)" : "var(--brand-surface-2)",
              color: viewMode === "list" ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: viewMode === "list" ? "none" : "var(--shadow-sm)",
            }}
          >
            <Icon name="list" size={16} />
          </button>
          <button
            type="button"
            data-testid="toggle-view-map"
            aria-label="Карта"
            onClick={() => switchView("map")}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: "none",
              background: viewMode === "map" ? "var(--brand-primary)" : "var(--brand-surface-2)",
              color: viewMode === "map" ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: viewMode === "map" ? "none" : "var(--shadow-sm)",
            }}
          >
            <Icon name="map" size={16} />
          </button>
        </div>

        {/* Filters panel — inline under header */}
        {showFilters && (
          <FiltersPanel filters={filters} onChange={setFilters} onReset={resetFilters} />
        )}
      </div>

      {/* Content area — both views mounted, toggled via display */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* List view */}
        <div
          style={{
            display: viewMode === "list" ? "flex" : "none",
            flexDirection: "column",
            height: "100%",
            overflowY: "auto",
          }}
        >
          <FeedView
            filters={filters}
            setFilters={setFilters}
            density={density}
            onRidesCount={setRidesCount}
          />
        </div>

        {/* Map view — always mounted to avoid re-init of Leaflet */}
        <div
          style={{
            display: viewMode === "map" ? "block" : "none",
            position: "absolute",
            inset: 0,
          }}
        >
          <MapScreen externalFilters={filters} height="100%" onRidesCount={setRidesCount} />
        </div>
      </div>
    </div>
  );
}
