import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiltersPanel } from "../components/FiltersPanel";
import { Icon } from "../components/Icon";
import type { RideCardState } from "../components/RideCard";
import { RideCard } from "../components/RideCard";
import { useFavorites } from "../hooks/useFavorites";
import { applyFilters, useFilters } from "../hooks/useFilters";
import { useMe } from "../hooks/useMe";
import { useMyRideRequests } from "../hooks/useMyRideRequests";
import { useRealtime } from "../hooks/useRealtime";
import { useRides } from "../hooks/useRides";
import type { Ride } from "../types/ride";

const VIEWED_KEY = "pp_viewed_rides";

function readViewedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

function writeViewed(id: string, current: Set<string>): Set<string> {
  const next = new Set<string>(current);
  next.add(id);
  try {
    const arr = [...next].slice(-200);
    localStorage.setItem(VIEWED_KEY, JSON.stringify(arr));
    return new Set<string>(arr);
  } catch {
    return next;
  }
}

const QUICK_CHIPS = [
  { id: "baum", label: "ул. Баумана", query: "Баумана" },
  { id: "dubr", label: "м. Дубравная", query: "Дубравная" },
  { id: "kolts", label: "ТЦ Кольцо", query: "Кольцо" },
  { id: "apo", label: "Аэропорт", query: "Аэропорт" },
  { id: "mega", label: "МЕГА", query: "МЕГА" },
  { id: "rail", label: "Вокзал", query: "Вокзал" },
  { id: "kfu", label: "КФУ", query: "КФУ" },
];

export function FeedScreen() {
  const navigate = useNavigate();
  const { filters, setFilters, resetFilters } = useFilters();
  const { data, isLoading, isError } = useRides(filters.datePreset, filters.fromAt, filters.toAt);
  useRealtime();
  const me = useMe();
  const myUserId = me.status === "ok" ? me.user.id : null;
  const requestMap = useMyRideRequests();
  const [viewedRides, setViewedRides] = useState<Set<string>>(readViewedSet);
  const { isFavorite, toggle: toggleFavorite, favoriteIds } = useFavorites();
  const [showFilters, setShowFilters] = useState(false);
  const [density, setDensity] = useState<"compact" | "cozy">(() => {
    return (localStorage.getItem("pp_density") as "compact" | "cozy") ?? "cozy";
  });
  const toggleDensity = () => {
    const next = density === "compact" ? "cozy" : "compact";
    setDensity(next);
    localStorage.setItem("pp_density", next);
  };
  const filteredRides = useMemo(
    () => applyFilters(data?.rides ?? [], filters, favoriteIds, myUserId),
    [data, filters, favoriteIds, myUserId],
  );

  function pluralRides(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return "маршрутов";
    if (mod10 === 1) return "маршрут";
    if (mod10 >= 2 && mod10 <= 4) return "маршрута";
    return "маршрутов";
  }

  const trustOn =
    filters.trustMinAccountAgeDays > 0 ||
    filters.trustMinLikes > 0 ||
    filters.favoritesOnly ||
    filters.verifiedOnly;

  if (isLoading) {
    return (
      <div
        data-testid="loading-skeleton"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "var(--brand-bg)",
        }}
      >
        <p style={{ color: "var(--brand-sub)", fontSize: 14 }}>Загрузка...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: 16,
          background: "var(--brand-bg)",
        }}
      >
        <p style={{ color: "var(--brand-danger)", fontSize: 14 }}>Ошибка: что-то пошло не так</p>
      </div>
    );
  }

  function getCardState(ride: Ride): RideCardState {
    if (myUserId && ride.driver_id === myUserId) return "own";
    const reqStatus = requestMap.get(ride.id);
    if (reqStatus === "accepted") return "approved";
    if (reqStatus === "pending") return "applied";
    if (viewedRides.has(ride.id)) return "viewed";
    return "default";
  }

  const handleCardClick = (ride: Ride) => {
    setViewedRides((prev) => writeViewed(ride.id, prev));
    navigate(`/rides/${ride.id}`);
  };

  const handleChipClick = (query: string) => {
    if (filters.direction === query) {
      setFilters({ direction: "" });
    } else {
      setFilters({ direction: query });
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--brand-surface)",
          borderBottom: "1px solid var(--brand-line)",
          padding: "8px 16px 10px",
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
              ЖК Царёво · Казань
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
              Попутчики
            </div>
          </div>
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
              background: trustOn ? "var(--brand-primary)" : "var(--brand-surface-2)",
              color: trustOn ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
              boxShadow: trustOn ? "none" : "var(--shadow-sm)",
            }}
          >
            <Icon name="filter" size={18} />
          </button>
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
      </div>

      {/* Quick destination chips */}
      <div
        style={{
          padding: "10px 16px 4px",
          display: "flex",
          gap: 6,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {QUICK_CHIPS.map((chip) => {
          const active = filters.direction === chip.query;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleChipClick(chip.query)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "none",
                flexShrink: 0,
                background: active ? "var(--brand-primary)" : "var(--brand-surface)",
                color: active ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "var(--shadow-sm)",
                whiteSpace: "nowrap",
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Trust filter banner */}
      {trustOn && (
        <div
          style={{
            margin: "10px 16px 0",
            padding: "10px 12px",
            borderRadius: 12,
            background: "var(--brand-primary-tint)",
            color: "var(--brand-primary)",
            fontSize: 12.5,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="shield" size={14} />
          Активны фильтры доверия
        </div>
      )}

      {/* Result count */}
      {!isLoading && !isError && (
        <div
          style={{
            padding: "6px 16px 0",
            fontSize: 12,
            color: "var(--brand-sub)",
            fontWeight: 500,
          }}
        >
          Найдено{" "}
          <span style={{ color: "var(--brand-text)", fontWeight: 700 }}>
            {filteredRides.length}
          </span>{" "}
          {pluralRides(filteredRides.length)}
        </div>
      )}

      {/* Filters panel */}
      {showFilters && (
        <FiltersPanel filters={filters} onChange={setFilters} onReset={resetFilters} />
      )}

      {/* Content */}
      <div
        data-testid="ride-list"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: density === "compact" ? 3 : 8,
          padding: "12px 16px 24px",
        }}
      >
        {!filteredRides.length ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--brand-text)",
                marginBottom: 4,
              }}
            >
              Ничего не найдено
            </div>
            <div style={{ fontSize: 13, color: "var(--brand-sub)" }}>
              Попробуйте изменить фильтры
            </div>
          </div>
        ) : (
          filteredRides.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              density={density}
              onClick={handleCardClick}
              isFavorited={isFavorite(ride.driver_id)}
              onToggleFavorite={() => toggleFavorite(ride.driver_id)}
              cardState={getCardState(ride)}
            />
          ))
        )}
      </div>
    </div>
  );
}
