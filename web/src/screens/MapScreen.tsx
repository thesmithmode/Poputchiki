import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getTelegramWebApp } from "../lib/telegram";
import type { Ride } from "../types/ride";

const DEFAULT_CENTER: [number, number] = [55.76, 49.1];
const DEFAULT_ZOOM = 11;
const CLUSTER_THRESHOLD = 50;

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export function MapScreen() {
  const navigate = useNavigate();
  const isDark = useDarkMode();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const tileLayerRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const polylinesRef = useRef<unknown[]>([]);
  const clusterGroupRef = useRef<unknown>(null);
  const locateMarkerRef = useRef<unknown>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [selected, setSelected] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);

  // Swap tile layer when theme changes
  useEffect(() => {
    const map = mapRef.current as {
      addLayer: (l: unknown) => void;
      removeLayer: (l: unknown) => void;
    } | null;
    if (!map || !tileLayerRef.current) return;

    import("leaflet").then((L) => {
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
      const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      const tile = L.tileLayer(tileUrl, {
        maxZoom: 19,
        subdomains: "abc",
        attribution: "© OpenStreetMap contributors",
        className: isDark ? "leaflet-tile-dark" : "",
      });
      tile.addTo(map as ReturnType<typeof L.map>);
      tileLayerRef.current = tile;
    });
  }, [isDark]);

  useEffect(() => {
    let destroyed = false;

    async function init() {
      if (!mapContainerRef.current) return;

      const [L] = await Promise.all([
        import("leaflet"),
        // @ts-ignore
        import("leaflet.markercluster"),
      ]);

      if (destroyed || !mapContainerRef.current) return;

      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        preferCanvas: true,
      });

      getTelegramWebApp()?.disableVerticalSwipes?.();

      const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

      const tile = L.tileLayer(tileUrl, {
        maxZoom: 19,
        subdomains: "abc",
        attribution: "© OpenStreetMap contributors",
        className: document.documentElement.classList.contains("dark") ? "leaflet-tile-dark" : "",
      });
      tile.addTo(map);
      tileLayerRef.current = tile;
      mapRef.current = map;

      const loadRides = async () => {
        if (destroyed) return;
        const bounds = map.getBounds();
        const center = bounds.getCenter();
        const ne = bounds.getNorthEast();
        const radiusKm =
          Math.max(center.distanceTo(ne), center.distanceTo(bounds.getSouthWest())) / 1000;

        try {
          const data = await apiFetch<{ rides: Ride[] }>(
            `/rides?fromLat=${center.lat.toFixed(6)}&fromLng=${center.lng.toFixed(6)}&radiusKm=${Math.ceil(radiusKm)}`,
          );
          if (!destroyed) {
            setRides(data.rides);
            renderMarkers(map, L, data.rides);
          }
        } catch {
          // network/API error — keep map visible, rides empty
        } finally {
          if (!destroyed) setLoading(false);
        }
      };

      map.on("moveend", loadRides);
      setTimeout(() => {
        map.invalidateSize();
        if (!destroyed) setLoading(false);
        loadRides();
      }, 80);
    }

    init().catch(() => {
      if (!destroyed) setLoading(false);
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  function handleLocate() {
    if (!mapRef.current || locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const lMap = mapRef.current as {
          flyTo: (c: [number, number], z: number) => void;
          addLayer: (l: unknown) => void;
          removeLayer: (l: unknown) => void;
        };
        import("leaflet").then((L) => {
          if (locateMarkerRef.current) {
            lMap.removeLayer(locateMarkerRef.current as Parameters<typeof lMap.removeLayer>[0]);
          }
          const circle = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: "#4DAB6E",
            fillOpacity: 1,
            color: "#fff",
            weight: 2.5,
          }).addTo(lMap as ReturnType<typeof L.map>);
          locateMarkerRef.current = circle;
          lMap.flyTo([lat, lng], 15);
          setLocating(false);
        });
      },
      () => setLocating(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  function renderMarkers(map: unknown, L: typeof import("leaflet"), rideList: Ride[]) {
    const lMap = map as ReturnType<typeof L.map>;

    for (const m of markersRef.current) {
      lMap.removeLayer(m as Parameters<typeof lMap.removeLayer>[0]);
    }
    for (const p of polylinesRef.current) {
      lMap.removeLayer(p as Parameters<typeof lMap.removeLayer>[0]);
    }
    if (clusterGroupRef.current) {
      lMap.removeLayer(
        clusterGroupRef.current as unknown as Parameters<typeof lMap.removeLayer>[0],
      );
    }
    markersRef.current = [];
    polylinesRef.current = [];

    if (rideList.length >= CLUSTER_THRESHOLD) {
      const winL = (window as unknown as { L?: { MarkerClusterGroup?: unknown } }).L;
      const lAny = L as unknown as { MarkerClusterGroup?: unknown };
      const MC = winL?.MarkerClusterGroup ?? lAny.MarkerClusterGroup;
      const GroupClass = MC as new () => { addLayer: (l: unknown) => void };
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

        const line = L.polyline(
          [
            [ride.from_lat, ride.from_lng],
            [ride.to_lat, ride.to_lng],
          ],
          { color: "var(--brand-primary, #2d5a3d)", weight: 2, opacity: 0.6, dashArray: "4 4" },
        ).addTo(lMap);
        polylinesRef.current.push(line);
      }
    }
  }

  const seatsLeft = selected ? selected.seats_total - selected.seats_taken : 0;

  const glassStyle: React.CSSProperties = {
    background: isDark ? "rgba(28,28,30,0.92)" : "rgba(255,255,255,0.96)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    color: isDark ? "#fff" : "var(--brand-text, #0e1410)",
  };

  return (
    <div data-testid="map-screen" style={{ position: "fixed", inset: 0, zIndex: 0 }}>
      {loading && (
        <div
          data-testid="map-loading"
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            ...glassStyle,
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 13,
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
            ...glassStyle,
            fontSize: 12.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4DAB6E" }} />
          {rides.length} поездок
        </div>
      )}

      {/* Map controls: locate + zoom */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: selected ? 176 : 100,
          zIndex: 5,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <button
          type="button"
          data-testid="locate-me"
          aria-label="Моё местоположение"
          onClick={handleLocate}
          style={{ ...zoomBtnBase, ...glassStyle, fontSize: 16 }}
        >
          {locating ? "…" : "◎"}
        </button>
        <button
          type="button"
          data-testid="zoom-in"
          onClick={() => (mapRef.current as { zoomIn: () => void } | null)?.zoomIn()}
          style={{ ...zoomBtnBase, ...glassStyle }}
        >
          +
        </button>
        <button
          type="button"
          data-testid="zoom-out"
          onClick={() => (mapRef.current as { zoomOut: () => void } | null)?.zoomOut()}
          style={{ ...zoomBtnBase, ...glassStyle }}
        >
          −
        </button>
      </div>

      {/* Selected ride card */}
      {selected && (
        <div
          style={{
            position: "absolute",
            bottom: 88,
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
              ...glassStyle,
              borderRadius: 16,
              padding: 16,
              border: isDark
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid var(--brand-line, rgba(15,23,42,0.06))",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.from_label}</div>
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
                  color: "var(--brand-sub, #6b716e)",
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 13, color: "var(--brand-sub, #6b716e)", marginBottom: 10 }}>
              → {selected.to_label}
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <span>{selected.price_rub !== null ? `${selected.price_rub} ₽` : "Договорная"}</span>
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

const zoomBtnBase: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  fontSize: 18,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
