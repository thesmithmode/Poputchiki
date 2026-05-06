import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiltersPanel } from "../components/FiltersPanel";
import { RideCard } from "../components/RideCard";
import { applyFilters, useFilters } from "../hooks/useFilters";
import { useRealtime } from "../hooks/useRealtime";
import { useRides } from "../hooks/useRides";
import type { Ride } from "../types/ride";

export function FeedScreen() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useRides();
  useRealtime();
  const { filters, setFilters, resetFilters } = useFilters();
  const [view, setView] = useState<"list" | "map">("list");
  const [showFilters, setShowFilters] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const filteredRides = useMemo(() => applyFilters(data?.rides ?? [], filters), [data, filters]);

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
      <div data-testid="loading-skeleton" className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Загрузка...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <p className="text-red-500">Ошибка: что-то пошло не так</p>
      </div>
    );
  }

  const handleCardClick = (ride: Ride) => {
    navigate(`/rides/${ride.id}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Попутчики</h1>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="toggle-filters"
            onClick={() => setShowFilters((v) => !v)}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
          >
            Фильтры
          </button>
          <button
            type="button"
            onClick={() => setView((v) => (v === "list" ? "map" : "list"))}
            className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100"
          >
            {view === "list" ? "Карта" : "Список"}
          </button>
        </div>
      </header>

      {showFilters && (
        <FiltersPanel filters={filters} onChange={setFilters} onReset={resetFilters} />
      )}

      {view === "list" ? (
        <div data-testid="ride-list" className="flex-1 space-y-3 p-4">
          {!filteredRides.length ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-gray-400">Ничего не найдено</p>
            </div>
          ) : (
            filteredRides.map((ride) => (
              <RideCard key={ride.id} ride={ride} onClick={handleCardClick} />
            ))
          )}
        </div>
      ) : (
        <div
          data-testid="ride-map"
          ref={mapRef}
          style={{ height: "calc(100vh - 57px)" }}
          className="flex-1"
        />
      )}
    </div>
  );
}
