import { useEffect, useRef, useState } from "react";
import { RideCard } from "../components/RideCard";
import { useRealtime } from "../hooks/useRealtime";
import { useRides } from "../hooks/useRides";
import type { Ride } from "../types/ride";

export function FeedScreen() {
  const { data, isLoading, isError } = useRides();
  useRealtime();
  const [view, setView] = useState<"list" | "map">("list");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (view !== "map" || !mapRef.current || !data?.rides.length) return;

    let destroyed = false;

    import("leaflet").then((L) => {
      if (destroyed || !mapRef.current) return;

      // Cleanup previous instance
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapRef.current).setView([55.78, 49.12], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      for (const ride of data.rides) {
        L.marker([ride.from_lat, ride.from_lng]).addTo(map).bindPopup(ride.from_label);
      }

      mapInstanceRef.current = map;
    });

    return () => {
      destroyed = true;
    };
  }, [view, data]);

  // Cleanup map on unmount
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

  const handleCardClick = (_ride: Ride) => {
    // TODO: navigate to ride detail screen
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-gray-900">Попутчики</h1>
        <button
          type="button"
          onClick={() => setView((v) => (v === "list" ? "map" : "list"))}
          className="text-sm font-medium text-blue-600 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
        >
          {view === "list" ? "Карта" : "Список"}
        </button>
      </header>

      {view === "list" ? (
        <div data-testid="ride-list" className="flex-1 p-4 space-y-3">
          {!data?.rides.length ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-gray-400 text-sm">Ничего не найдено</p>
            </div>
          ) : (
            data.rides.map((ride) => (
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
