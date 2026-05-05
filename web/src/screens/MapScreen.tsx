import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import type { Ride } from "../types/ride";

const DEFAULT_CENTER: [number, number] = [55.79, 49.18];
const DEFAULT_ZOOM = 12;
const CLUSTER_THRESHOLD = 50;

export function MapScreen() {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const polylinesRef = useRef<unknown[]>([]);
  const clusterGroupRef = useRef<unknown>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [selected, setSelected] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let destroyed = false;

    async function init() {
      if (!mapContainerRef.current) return;

      const [L] = await Promise.all([
        import("leaflet"),
        import("leaflet.markercluster"),
      ]);

      if (destroyed || !mapContainerRef.current) return;

      // Cleanup previous
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        preferCanvas: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      const loadRides = async () => {
        if (destroyed) return;
        const bounds = map.getBounds();
        const center = bounds.getCenter();
        const ne = bounds.getNorthEast();
        const radiusKm =
          Math.max(
            center.distanceTo(ne),
            center.distanceTo(bounds.getSouthWest()),
          ) / 1000;

        try {
          const data = await apiFetch<{ rides: Ride[] }>(
            `/rides?fromLat=${center.lat.toFixed(6)}&fromLng=${center.lng.toFixed(6)}&radiusKm=${Math.ceil(radiusKm)}`,
          );
          if (!destroyed) {
            setRides(data.rides);
            setLoading(false);
            renderMarkers(map, L, data.rides);
          }
        } catch {
          if (!destroyed) setLoading(false);
        }
      };

      map.on("moveend", loadRides);
      setTimeout(() => {
        map.invalidateSize();
        loadRides();
      }, 80);
    }

    init();

    return () => {
      destroyed = true;
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  }, []);

  function renderMarkers(
    map: unknown,
    L: typeof import("leaflet"),
    rideList: Ride[],
  ) {
    const lMap = map as ReturnType<typeof L.map>;

    // Clear old markers + polylines
    for (const m of markersRef.current) {
      lMap.removeLayer(m as Parameters<typeof lMap.removeLayer>[0]);
    }
    for (const p of polylinesRef.current) {
      lMap.removeLayer(p as Parameters<typeof lMap.removeLayer>[0]);
    }
    if (clusterGroupRef.current) {
      lMap.removeLayer(clusterGroupRef.current as unknown as Parameters<typeof lMap.removeLayer>[0]);
    }
    markersRef.current = [];
    polylinesRef.current = [];

    if (rideList.length >= CLUSTER_THRESHOLD) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const MC = (window as any).L?.MarkerClusterGroup ?? (L as any).MarkerClusterGroup;
      const GroupClass: new () => { addLayer: (l: unknown) => void } = MC;
      const group = new GroupClass();
      for (const ride of rideList) {
        const marker = L.marker([ride.from_lat, ride.from_lng]);
        marker.on("click", () => setSelected(ride));
        group.addLayer(marker);
        markersRef.current.push(marker);
      }
      lMap.addLayer(group as unknown as Parameters<typeof lMap.addLayer>[0]);
      clusterGroupRef.current = group;
    } else {
      clusterGroupRef.current = null;
      for (const ride of rideList) {
        const marker = L.marker([ride.from_lat, ride.from_lng]).addTo(lMap);
        marker.on("click", () => setSelected(ride));
        markersRef.current.push(marker);

        // Route line from→to
        const line = L.polyline(
          [
            [ride.from_lat, ride.from_lng],
            [ride.to_lat, ride.to_lng],
          ],
          { color: "#0ea5e9", weight: 2, opacity: 0.6, dashArray: "4 4" },
        ).addTo(lMap);
        polylinesRef.current.push(line);
      }
    }
  }

  const seatsLeft = selected ? selected.seats_total - selected.seats_taken : 0;

  return (
    <div data-testid="map-screen" style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
      {loading && (
        <div
          data-testid="map-loading"
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            background: "rgba(255,255,255,0.95)",
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 13,
            color: "#666",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          Загрузка...
        </div>
      )}

      <div
        ref={mapContainerRef}
        data-testid="leaflet-container"
        style={{ position: "absolute", inset: 0 }}
      />

      {/* Ride count chip */}
      {!loading && (
        <div
          data-testid="rides-count"
          style={{
            position: "absolute",
            left: 12,
            top: 16,
            zIndex: 5,
            padding: "8px 12px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.96)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "#15191f",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{ width: 6, height: 6, borderRadius: "50%", background: "#4DAB6E" }}
          />
          {rides.length} поездок
        </div>
      )}

      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: selected ? 180 : 28,
          zIndex: 5,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <button
          type="button"
          data-testid="zoom-in"
          onClick={() => (mapRef.current as { zoomIn: () => void } | null)?.zoomIn()}
          style={zoomBtnStyle}
        >
          +
        </button>
        <button
          type="button"
          data-testid="zoom-out"
          onClick={() => (mapRef.current as { zoomOut: () => void } | null)?.zoomOut()}
          style={zoomBtnStyle}
        >
          −
        </button>
      </div>

      {/* Back button */}
      <button
        type="button"
        data-testid="back-btn"
        onClick={() => navigate(-1)}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 10,
          background: "rgba(255,255,255,0.96)",
          border: "none",
          borderRadius: 12,
          width: 40,
          height: 40,
          fontSize: 18,
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Назад"
      >
        ←
      </button>

      {/* Selected ride card */}
      {selected && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            right: 12,
            zIndex: 5,
          }}
        >
          <button
            type="button"
            data-testid="selected-ride-card"
            onClick={() => navigate(`/rides/${selected.id}`)}
            style={{
              width: "100%",
              textAlign: "left",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              border: "1px solid #e5e7eb",
              boxShadow: "0 12px 28px -6px rgba(15,23,42,0.18)",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#15191f" }}>
                {selected.from_label}
              </div>
              <button
                type="button"
                data-testid="close-selected"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 16,
                  color: "#7c8694",
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 13, color: "#7c8694", marginBottom: 10 }}>
              → {selected.to_label}
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                fontSize: 13,
                fontWeight: 600,
                color: "#15191f",
              }}
            >
              <span>
                {selected.price_rub !== null ? `${selected.price_rub} ₽` : "Договорная"}
              </span>
              <span style={{ color: seatsLeft === 0 ? "#e54e5c" : "#4dab6e" }}>
                {seatsLeft === 0 ? "Нет мест" : `${seatsLeft} мест`}
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  background: "rgba(255,255,255,0.96)",
  color: "#333",
  boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
  fontSize: 18,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
