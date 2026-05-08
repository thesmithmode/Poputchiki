import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiltersPanel } from "../components/FiltersPanel";
import { Icon } from "../components/Icon";
import { RideCard } from "../components/RideCard";
import { useFavorites } from "../hooks/useFavorites";
import { applyFilters, useFilters } from "../hooks/useFilters";
import { useRealtime } from "../hooks/useRealtime";
import { useRides } from "../hooks/useRides";
import type { Ride } from "../types/ride";

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
  const { data, isLoading, isError } = useRides();
  useRealtime();
  const { filters, setFilters, resetFilters } = useFilters();
  const { isFavorite, toggle: toggleFavorite, favoriteIds } = useFavorites();
  const [view, setView] = useState<"list" | "map">("list");
  const [showFilters, setShowFilters] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const filteredRides = useMemo(
    () => applyFilters(data?.rides ?? [], filters, favoriteIds),
    [data, filters, favoriteIds],
  );

  const trustOn =
    filters.trustMinAccountAgeDays > 0 ||
    filters.trustMinLikes > 0 ||
    filters.favoritesOnly ||
    filters.verifiedOnly;

  useEffect(() => {
    if (view !== "map" || !mapRef.current || !filteredRides.length) return;

    let destroyed = false;

    import("leaflet").then((L) => {
      if (destroyed || !mapRef.current) return;

      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapRef.current).setView([55.78, 49.12], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      for (const ride of filteredRides) {
        L.marker([ride.from_lat, ride.from_lng]).addTo(map).bindPopup(ride.from_label);
      }

      mapInstanceRef.current = map;
    });

    return () => {
      destroyed = true;
    };
  }, [view, filteredRides]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

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
        <p style={{ color: "#e54e5c", fontSize: 14 }}>Ошибка: что-то пошло не так</p>
      </div>
    );
  }

  const handleCardClick = (ride: Ride) => {
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
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
          background: "rgba(255,255,255,0.78)",
          borderBottom: "1px solid rgba(15,23,42,0.05)",
          padding: "8px 16px 10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--brand-sub)",
                fontWeight: 500,
                marginBottom: 2,
              }}
            >
              ЖК Царёво · Казань
            </div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 700,
                color: "var(--brand-text)",
                letterSpacing: -0.3,
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
              borderRadius: 18,
              border: "none",
              background: trustOn ? "var(--brand-primary)" : "#F1F4F8",
              color: trustOn ? "#fff" : "var(--brand-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <Icon name="filter" size={18} />
          </button>
          <button
            type="button"
            onClick={() => setView((v) => (v === "list" ? "map" : "list"))}
            style={{
              padding: "6px 12px",
              borderRadius: 18,
              border: "none",
              background: view === "map" ? "var(--brand-primary)" : "#F1F4F8",
              color: view === "map" ? "#fff" : "var(--brand-text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {view === "list" ? "Карта" : "Список"}
          </button>
        </div>
      </div>

      {/* Quick destination chips */}
      {view === "list" && (
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
                  padding: "7px 13px",
                  borderRadius: 999,
                  border: active ? "none" : "none",
                  flexShrink: 0,
                  background: active ? "var(--brand-primary)" : "var(--brand-surface)",
                  color: active ? "#fff" : "var(--brand-text)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 1px 1px rgba(20,30,50,0.04)",
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Trust filter banner */}
      {trustOn && (
        <div
          style={{
            margin: "8px 16px 0",
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(45,90,61,0.08)",
            color: "var(--brand-primary)",
            fontSize: 12.5,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="shield" size={14} />
          Активны фильтры доверия
        </div>
      )}

      {/* Filters panel */}
      {showFilters && (
        <FiltersPanel filters={filters} onChange={setFilters} onReset={resetFilters} />
      )}

      {/* Content */}
      {view === "list" ? (
        <div
          data-testid="ride-list"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 8,
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
                onClick={handleCardClick}
                isFavorited={isFavorite(ride.driver_id)}
                onToggleFavorite={() => toggleFavorite(ride.driver_id)}
              />
            ))
          )}
        </div>
      ) : (
        <div
          data-testid="ride-map"
          ref={mapRef}
          style={{ height: "calc(100vh - 120px)", flex: 1 }}
        />
      )}
    </div>
  );
}
