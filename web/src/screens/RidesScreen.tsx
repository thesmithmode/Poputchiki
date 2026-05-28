import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiltersPanel } from "../components/FiltersPanel";
import { Icon } from "../components/Icon";
import { useFilters } from "../hooks/useFilters";
import { getCurrentLocation } from "../lib/geolocation";
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

const DENSITY_KEY = "pp_density";

export function RidesScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { filters, setFilters, resetFilters } = useFilters();
  const viewMode: ViewMode = location.pathname === "/map" ? "map" : "list";
  const [density, setDensity] = useState<"compact" | "cozy">(
    () => (localStorage.getItem(DENSITY_KEY) as "compact" | "cozy") ?? "cozy",
  );
  const [showFilters, setShowFilters] = useState(false);
  const [ridesCount, setRidesCount] = useState<number | null>(null);
  const [feedMeta, setFeedMeta] = useState<{
    isFetching: boolean;
    dataUpdatedAt: number;
    refetch: () => void;
  } | null>(null);
  const locationRequestedRef = useRef(false);

  const trustOn =
    filters.trustMinAccountAgeDays > 0 || filters.trustMinLikes > 0 || filters.verifiedOnly;

  function switchView(mode: ViewMode) {
    navigate(mode === "map" ? "/map" : "/");
  }

  function toggleDensity() {
    const next = density === "compact" ? "cozy" : "compact";
    setDensity(next);
    localStorage.setItem(DENSITY_KEY, next);
  }

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    if (locationRequestedRef.current) return;
    if (filters.fromLat !== null || filters.fromLng !== null || filters.fromLabel) return;
    locationRequestedRef.current = true;
    let cancelled = false;
    getCurrentLocation().then((loc) => {
      if (cancelled || !loc) return;
      setFilters({
        fromLabel: "Мое местоположение",
        fromLat: loc.lat,
        fromLng: loc.lng,
        radiusKm: 2,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [filters.fromLat, filters.fromLng, filters.fromLabel, setFilters]);

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
      {/* Shared header — identical on /  and /map */}
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
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--brand-text)",
                letterSpacing: -0.2,
                lineHeight: 1.2,
              }}
            >
              Поездки
            </div>
            {ridesCount !== null && (
              <span
                data-testid="rides-count-chip"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--brand-sub)",
                  background: "var(--brand-surface-2)",
                  padding: "2px 8px",
                  borderRadius: 10,
                  letterSpacing: 0.05,
                  whiteSpace: "nowrap",
                }}
              >
                {ridesCount} {pluralRides(ridesCount)}
              </span>
            )}
            {feedMeta?.isFetching ? (
              <span style={{ fontSize: 11, color: "var(--brand-sub)", whiteSpace: "nowrap" }}>
                Обновляется
              </span>
            ) : feedMeta?.dataUpdatedAt ? (
              <span style={{ fontSize: 11, color: "var(--brand-sub)", whiteSpace: "nowrap" }}>
                {new Date(feedMeta.dataUpdatedAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>

          {feedMeta && (
            <button
              type="button"
              data-testid="refresh-rides"
              aria-label="Обновить ленту"
              onClick={() => feedMeta.refetch()}
              disabled={feedMeta.isFetching}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: "none",
                background: "var(--brand-surface-2)",
                color: "var(--brand-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: feedMeta.isFetching ? "default" : "pointer",
                opacity: feedMeta.isFetching ? 0.45 : 1,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <Icon name="repeat" size={16} />
            </button>
          )}

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

          {/* Density toggle — visible on both views, applies to list */}
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
              background: density === "compact" ? "var(--brand-primary)" : "var(--brand-surface-2)",
              color: density === "compact" ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: density === "compact" ? "none" : "var(--shadow-sm)",
            }}
          >
            <Icon name={density === "compact" ? "list" : "grid"} size={16} />
          </button>
        </div>

        {/* Filters panel — inline under header */}
        {showFilters && (
          <FiltersPanel filters={filters} onChange={setFilters} onReset={resetFilters} />
        )}
      </div>

      {/* Content area — both views always mounted; map uses visibility to keep Leaflet sized */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* List view */}
        <div
          data-testid="feed-view-wrapper"
          style={{
            display: viewMode === "list" ? "flex" : "none",
            flexDirection: "column",
            height: "100%",
            overflowY: "auto",
          }}
        >
          <FeedView
            filters={filters}
            density={density}
            onRidesCount={setRidesCount}
            onFeedMeta={setFeedMeta}
          />
        </div>

        {/* Map view — always mounted, visibility toggled so Leaflet keeps proper dimensions */}
        <div
          data-testid="map-view-wrapper"
          style={{
            position: "absolute",
            inset: 0,
            visibility: viewMode === "map" ? "visible" : "hidden",
            pointerEvents: viewMode === "map" ? "auto" : "none",
          }}
          aria-hidden={viewMode !== "map"}
        >
          <MapScreen externalFilters={filters} height="100%" onRidesCount={setRidesCount} />
        </div>

        {/* Hidden buttons for tests — view switching is via bottom tabs but tests need handles */}
        <button
          type="button"
          data-testid="toggle-view-list"
          onClick={() => switchView("list")}
          style={{ display: "none" }}
          aria-hidden
        />
        <button
          type="button"
          data-testid="toggle-view-map"
          onClick={() => switchView("map")}
          style={{ display: "none" }}
          aria-hidden
        />
      </div>
    </div>
  );
}
