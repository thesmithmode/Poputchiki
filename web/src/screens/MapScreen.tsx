import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getTelegramWebApp } from "../lib/telegram";
import type { Ride } from "../types/ride";

const DEFAULT_CENTER: [number, number] = [55.76, 49.1];
const DEFAULT_ZOOM = 11;
const CLUSTER_THRESHOLD = 50;

const AVATAR_COLORS = ["#2d5a3d", "#e67e22", "#2980b9", "#8e44ad", "#c0392b", "#16a085"];

function getAvatarColor(driverId: string): string {
  let hash = 0;
  for (const c of driverId) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? "#2d5a3d";
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? "?";
    const b = parts[1]?.[0] ?? "?";
    return (a + b).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function makeRideMarkerHtml(ride: Ride): string {
  const initials = getInitials(ride.driver_display_name);
  const avatarColor = getAvatarColor(ride.driver_id);
  const time = formatTime(ride.departure_at);
  const price = ride.price_rub !== null ? `${ride.price_rub}₽` : "Догов.";
  return `<div style="position:relative;background:#fff;border-radius:10px;padding:5px 8px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(0,0,0,.22);cursor:pointer;border:1px solid rgba(0,0,0,.08);white-space:nowrap"><div style="width:26px;height:26px;border-radius:50%;background:${avatarColor};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initials}</div><div><div style="font-size:12px;font-weight:700;color:#0e1410;line-height:1.2">${time}</div><div style="font-size:11px;color:#6b716e;line-height:1.2">${price}</div></div><div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #fff"></div></div>`;
}

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
  const clusterGroupRef = useRef<unknown>(null);
  const locateMarkerRef = useRef<unknown>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [selected, setSelected] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  useEffect(() => {
    if (!locateError) return;
    const t = setTimeout(() => setLocateError(null), 3500);
    return () => clearTimeout(t);
  }, [locateError]);

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

      const tg = getTelegramWebApp();
      // Expand to full screen — critical on PC Telegram where app starts collapsed
      tg?.expand?.();

      const [L] = await Promise.all([
        import("leaflet"),
        // markercluster is optional: if import fails (e.g. PC Telegram CSP), map still works
        import("leaflet.markercluster").catch(() => null),
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

      tg?.disableVerticalSwipes?.();

      // Re-invalidate when Telegram resizes the viewport (common on PC during animation)
      tg?.onEvent?.("viewportChanged", () => {
        if (mapRef.current) {
          (mapRef.current as { invalidateSize: (o: unknown) => void }).invalidateSize({
            animate: false,
          });
        }
      });

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

      // Debounce: активный pan генерит десятки moveend/sec → без debounce при 50k DAU = DoS.
      // 400ms — пользователь успевает отпустить палец, запрос идёт один раз.
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const debouncedLoadRides = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          loadRides();
        }, 400);
      };
      map.on("moveend", debouncedLoadRides);

      // First invalidateSize: DOM settled (fast path)
      setTimeout(() => {
        if (!destroyed) {
          map.invalidateSize();
          setLoading(false);
          loadRides();
        }
      }, 100);

      // Second invalidateSize: PC Telegram animates the window open — map container
      // may still have wrong dimensions at 100ms, correct at 600ms.
      setTimeout(() => {
        if (!destroyed && mapRef.current) {
          (mapRef.current as { invalidateSize: (o: unknown) => void }).invalidateSize({
            animate: false,
          });
        }
      }, 600);
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

  function applyLocationOnMap(lat: number, lng: number) {
    const lMap = mapRef.current as {
      flyTo: (c: [number, number], z: number) => void;
      addLayer: (l: unknown) => void;
      removeLayer: (l: unknown) => void;
    };
    import("leaflet").then((L) => {
      if (locateMarkerRef.current) {
        lMap.removeLayer(locateMarkerRef.current as Parameters<typeof lMap.removeLayer>[0]);
      }
      const locateColor =
        getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim() ||
        "#2d5a3d";
      const circle = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: locateColor,
        fillOpacity: 1,
        color: "#fff",
        weight: 2.5,
      }).addTo(lMap as ReturnType<typeof L.map>);
      locateMarkerRef.current = circle;
      lMap.flyTo([lat, lng], 15);
      setLocating(false);
    });
  }

  function handleLocate() {
    if (!mapRef.current || locating) return;
    setLocating(true);
    setLocateError(null);

    // Telegram WebApp LocationManager (Bot API 8.0+)
    const tgWA = getTelegramWebApp() as unknown as {
      LocationManager?: {
        init?: (cb: () => void) => void;
        requestLocation?: (
          cb: (loc: { latitude: number; longitude: number } | null) => void,
        ) => void;
        isInited?: boolean;
        isLocationAvailable?: boolean;
      };
    };
    const lm = tgWA?.LocationManager;

    // На PC Telegram нет LocationManager → browser geolocation тоже не работает в iframe.
    // Предупреждаем сразу, не пытаясь делать запрос.
    if (tgWA && !lm) {
      setLocating(false);
      setLocateError("Геолокация доступна только в мобильном Telegram");
      return;
    }

    if (lm?.requestLocation) {
      const doRequest = () =>
        lm.requestLocation?.((loc) => {
          if (loc) {
            applyLocationOnMap(loc.latitude, loc.longitude);
          } else {
            setLocating(false);
            setLocateError("Геолокация недоступна");
          }
        });
      if (!lm.isInited && lm.init) {
        lm.init(doRequest);
      } else {
        doRequest();
      }
      return;
    }

    // Fallback: browser geolocation API
    if (!navigator.geolocation) {
      setLocating(false);
      setLocateError("Геолокация не поддерживается");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyLocationOnMap(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocating(false);
        if (err.code === 1) {
          setLocateError("Разрешите геолокацию в настройках Telegram");
        } else if (err.code === 2) {
          setLocateError("Геолокация временно недоступна");
        } else {
          setLocateError("Не удалось определить местоположение");
        }
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  function renderMarkers(map: unknown, L: typeof import("leaflet"), rideList: Ride[]) {
    const lMap = map as ReturnType<typeof L.map>;

    for (const m of markersRef.current) {
      lMap.removeLayer(m as Parameters<typeof lMap.removeLayer>[0]);
    }
    if (clusterGroupRef.current) {
      lMap.removeLayer(
        clusterGroupRef.current as unknown as Parameters<typeof lMap.removeLayer>[0],
      );
    }
    markersRef.current = [];

    if (rideList.length >= CLUSTER_THRESHOLD) {
      // At high density use simple dots inside clusters for performance
      const cs = getComputedStyle(document.documentElement);
      const colorPrimary = cs.getPropertyValue("--brand-primary").trim() || "#2d5a3d";
      const dotIcon = L.divIcon({
        className: "",
        html: `<div style="width:10px;height:10px;border-radius:50%;background:${colorPrimary};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25)"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });

      const winL = (window as unknown as { L?: { MarkerClusterGroup?: unknown } }).L;
      const lAny = L as unknown as { MarkerClusterGroup?: unknown };
      const MC = winL?.MarkerClusterGroup ?? lAny.MarkerClusterGroup;

      if (MC) {
        const GroupClass = MC as new () => { addLayer: (l: unknown) => void };
        const group = new GroupClass();
        for (const ride of rideList) {
          const marker = L.marker([ride.from_lat, ride.from_lng], { icon: dotIcon });
          marker.on("click", () => setSelected(ride));
          group.addLayer(marker);
          markersRef.current.push(marker);
        }
        lMap.addLayer(group as unknown as Parameters<typeof lMap.addLayer>[0]);
        clusterGroupRef.current = group;
      } else {
        // MarkerCluster unavailable — render individual rich cards
        clusterGroupRef.current = null;
        for (const ride of rideList) {
          const icon = L.divIcon({
            className: "",
            html: makeRideMarkerHtml(ride),
            iconSize: [112, 41],
            iconAnchor: [56, 41],
          });
          const marker = L.marker([ride.from_lat, ride.from_lng], { icon }).addTo(lMap);
          marker.on("click", () => setSelected(ride));
          markersRef.current.push(marker);
        }
      }
    } else {
      // Rich ride-card markers — no route polylines on global map
      clusterGroupRef.current = null;
      for (const ride of rideList) {
        const icon = L.divIcon({
          className: "",
          html: makeRideMarkerHtml(ride),
          iconSize: [112, 41],
          iconAnchor: [56, 41],
        });
        const marker = L.marker([ride.from_lat, ride.from_lng], { icon }).addTo(lMap);
        marker.on("click", () => setSelected(ride));
        markersRef.current.push(marker);
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
    <div
      data-testid="map-screen"
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--brand-bg)",
      }}
    >
      {loading && (
        <div
          data-testid="map-loading"
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
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
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      />

      {/* Ride count chip */}
      {!loading && (
        <div
          data-testid="rides-count"
          style={{
            position: "absolute",
            left: 12,
            top: 16,
            zIndex: 1000,
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
          <span
            style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-primary)" }}
          />
          {rides.length} поездок
        </div>
      )}

      {/* Geolocation error toast */}
      {locateError && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            ...glassStyle,
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 13,
            color: "var(--brand-danger, #c0392b)",
            whiteSpace: "nowrap",
          }}
        >
          {locateError}
        </div>
      )}

      {/* Map controls: locate + zoom */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: selected ? 176 : 100,
          zIndex: 1000,
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

      {/* Selected ride card — close button is a sibling, not nested inside card button */}
      {selected && (
        <div
          style={{
            position: "absolute",
            bottom: 88,
            left: 12,
            right: 12,
            zIndex: 1000,
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
              padding: "16px 44px 16px 16px",
              border: isDark
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid var(--brand-line, rgba(15,23,42,0.06))",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              {selected.from_label}
            </div>
            <div style={{ fontSize: 13, color: "var(--brand-sub, #6b716e)", marginBottom: 10 }}>
              → {selected.to_label}
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 13, fontWeight: 600 }}>
              <span>{selected.price_rub !== null ? `${selected.price_rub} ₽` : "Договорная"}</span>
              <span
                style={{ color: seatsLeft === 0 ? "var(--brand-danger)" : "var(--brand-primary)" }}
              >
                {seatsLeft === 0 ? "Нет мест" : `${seatsLeft} мест`}
              </span>
            </div>
          </button>
          <button
            type="button"
            data-testid="close-selected"
            aria-label="Закрыть карточку"
            onClick={() => setSelected(null)}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 32,
              height: 32,
              background: "none",
              border: "none",
              fontSize: 18,
              color: "var(--brand-sub, #6b716e)",
              cursor: "pointer",
              padding: 0,
              borderRadius: 8,
              zIndex: 1,
            }}
          >
            ✕
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
