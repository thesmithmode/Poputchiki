import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { applyFilters, resolveDateRange, useFilters } from "../hooks/useFilters";
import type { Filters } from "../hooks/useFilters";
import { useMe } from "../hooks/useMe";
import { useMyRideRequests } from "../hooks/useMyRideRequests";
import { apiFetch } from "../lib/api";
import {
  type RideCardState,
  getRideCardBg,
  getRideCardBorderColor,
  getRideCardState,
  markRideViewed,
  readViewedRideIds,
} from "../lib/rideCardState";
import { getTelegramWebApp } from "../lib/telegram";
import type { Ride } from "../types/ride";

interface MapScreenProps {
  externalFilters?: Filters;
  height?: string;
  onRidesCount?: (n: number) => void;
}

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function markerDateLabel(isoStr: string): string | null {
  const dep = new Date(isoStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const depStart = new Date(dep.getFullYear(), dep.getMonth(), dep.getDate());
  const diffDays = Math.round((depStart.getTime() - todayStart.getTime()) / 86400000);
  if (diffDays <= 0) return null;
  if (diffDays === 1) return "завтра";
  return dep.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function makeRideMarkerHtml(ride: Ride, cardState: RideCardState): string {
  const initials = escapeHtml(getInitials(ride.driver_display_name));
  const avatarColor = getAvatarColor(ride.driver_id);
  const cardBg = getRideCardBg(cardState);
  const borderColor = getRideCardBorderColor(cardState) ?? "rgba(0,0,0,.08)";
  const boxShadow =
    cardState === "default"
      ? "0 2px 10px rgba(0,0,0,.22)"
      : `0 2px 10px rgba(0,0,0,.22), inset 0 0 0 1.5px ${borderColor}`;
  const time = formatTime(ride.departure_at);
  const price = ride.price_rub !== null ? `${ride.price_rub}₽` : "Догов.";
  const rawFirstName = ride.driver_display_name?.trim().split(/\s+/)[0] ?? "";
  const firstName = escapeHtml(truncate(rawFirstName, 12));
  const hasRating = ride.driver_reviews_count != null && ride.driver_reviews_count > 0;
  const ratingStr = hasRating ? `★ ${Number(ride.driver_avg_stars).toFixed(1)}` : "новый";
  const subLine = firstName
    ? `<div style="font-size:10px;color:#6b716e;line-height:1.3;margin-top:1px;overflow:hidden;text-overflow:ellipsis">${ratingStr} · ${firstName}</div>`
    : "";
  const dl = markerDateLabel(ride.departure_at);
  const dateLine = dl
    ? `<div style="font-size:9px;font-weight:600;color:#2d5a3d;line-height:1;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:2px">${escapeHtml(dl)}</div>`
    : "";
  return `<div style="position:relative;background:${cardBg};border-radius:10px;padding:5px 8px;display:inline-flex;align-items:center;gap:6px;box-shadow:${boxShadow};cursor:pointer;border:1px solid ${borderColor};white-space:nowrap;max-width:180px"><div style="width:28px;height:28px;border-radius:50%;background:${avatarColor};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initials}</div><div style="min-width:0;overflow:hidden">${dateLine}<div style="font-size:12px;font-weight:700;color:var(--brand-text,#0e1410);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${time}&nbsp;&nbsp;${price}</div>${subLine}</div><div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid ${cardBg}"></div></div>`;
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

export function MapScreen({
  externalFilters,
  height = "100dvh",
  onRidesCount,
}: MapScreenProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = useDarkMode();
  const internal = useFilters();
  const filters = externalFilters ?? internal.filters;
  const me = useMe();
  const myUserId = me.status === "ok" ? me.user.id : null;
  const requestMap = useMyRideRequests();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const tileLayerRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const clusterGroupRef = useRef<unknown>(null);
  const locateMarkerRef = useRef<unknown>(null);
  const compassMarkerRef = useRef<unknown>(null);
  const orientationCleanupRef = useRef<(() => void) | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const loadRidesRef = useRef<(() => void) | null>(null);
  const filtersRef = useRef(filters);
  const [rides, setRides] = useState<Ride[]>([]);
  const [selected, setSelected] = useState<Ride | null>(null);
  const [viewedRides, setViewedRides] = useState<Set<string>>(readViewedRideIds);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Keep filtersRef in sync so loadRides always reads current filters without remounting map
  filtersRef.current = filters;

  // Карта живёт постоянно (не демонтируется). При возврате на /map — пересчитать размер.
  useEffect(() => {
    if (location.pathname !== "/map" || !mapRef.current) return;
    const t = setTimeout(() => {
      (mapRef.current as { invalidateSize: (o: unknown) => void } | null)?.invalidateSize({
        animate: false,
      });
    }, 50);
    return () => clearTimeout(t);
  }, [location.pathname]);

  // Пре-инициализация LocationManager при маунте — чтобы к нажатию кнопки уже был готов
  useEffect(() => {
    const lm = getTelegramWebApp()?.LocationManager;
    if (lm && !lm.isInited) {
      lm.init();
    }
  }, []);

  useEffect(() => {
    if (!locateError) return;
    const t = setTimeout(() => setLocateError(null), 3500);
    return () => clearTimeout(t);
  }, [locateError]);

  // Toggle dark filter via CSS class on the map container — no tile layer swap, no flicker
  useEffect(() => {
    if (!mapContainerRef.current) return;
    mapContainerRef.current.classList.toggle("leaflet-dark", isDark);
  }, [isDark]);

  // Reload markers when filters change (map already initialized)
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadRidesRef is a stable ref
  useEffect(() => {
    loadRidesRef.current?.();
  }, [filters]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: renderMarkers reads current user/request/viewed state through closure
  useEffect(() => {
    if (!mapRef.current || rides.length === 0) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (!cancelled && mapRef.current) renderMarkers(mapRef.current, L, rides);
    });
    return () => {
      cancelled = true;
    };
  }, [rides, requestMap, viewedRides, myUserId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: onRidesCount is a stable prop ref, map init runs once
  useEffect(() => {
    let destroyed = false;
    let ro: ResizeObserver | null = null;

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
        minZoom: 9,
        maxZoom: 17,
        maxBounds: [
          [54.5, 47.5],
          [57.0, 52.0],
        ],
        maxBoundsViscosity: 1.0,
        zoomControl: false,
        preferCanvas: true,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        inertia: true,
        inertiaDeceleration: 3000,
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

      // Local dev → OSM directly. Production → own caching proxy on same origin.
      const h = window.location.hostname;
      const tileUrl =
        h === "localhost" || h.startsWith("127.")
          ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          : `${window.location.origin}/tiles/{s}/{z}/{x}/{y}.png`;

      const tile = L.tileLayer(tileUrl, {
        minZoom: 9,
        maxZoom: 17,
        subdomains: "abc",
        attribution: "© OpenStreetMap contributors",
        keepBuffer: 6,
        updateWhenZooming: false,
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

        const { fromAt, toAt } = resolveDateRange(filtersRef.current);
        const params = new URLSearchParams({
          fromLat: center.lat.toFixed(6),
          fromLng: center.lng.toFixed(6),
          radiusKm: String(Math.ceil(radiusKm)),
        });
        if (fromAt) params.set("fromAt", fromAt);
        if (toAt) params.set("toAt", toAt);
        if (filtersRef.current.priceMax !== null)
          params.set("priceMax", String(filtersRef.current.priceMax));
        if (filtersRef.current.seatsMin > 0)
          params.set("seatsMin", String(filtersRef.current.seatsMin));

        try {
          const data = await apiFetch<{ rides: Ride[] }>(`/rides?${params.toString()}`);
          if (!destroyed) {
            const filtered = applyFilters(data.rides, filtersRef.current, undefined, myUserId);
            setRides(filtered);
            onRidesCount?.(filtered.length);
            renderMarkers(map, L, filtered);
          }
        } catch {
          // network/API error — keep map visible, rides empty
        } finally {
          if (!destroyed) setLoading(false);
        }
      };
      loadRidesRef.current = loadRides;

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

      // ResizeObserver: catches any late viewport changes (Telegram expand animation,
      // orientation change, PC window resize) without relying on fixed timeouts.
      let prevW = 0;
      let prevH = 0;
      if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
        ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry || destroyed) return;
          const { width, height } = entry.contentRect;
          if (width === prevW && height === prevH) return;
          prevW = width;
          prevH = height;
          if (mapRef.current) {
            (mapRef.current as { invalidateSize: (o: unknown) => void }).invalidateSize({
              animate: false,
            });
          }
        });
        ro.observe(mapContainerRef.current);
      }

      // Start loading tiles + data, but keep overlay until 600ms (Telegram expand animation).
      setTimeout(() => {
        if (!destroyed) {
          map.invalidateSize();
          loadRides();
        }
      }, 100);

      // 600ms: Telegram has finished expanding → map is correctly sized → safe to hide overlay.
      setTimeout(() => {
        if (!destroyed && mapRef.current) {
          (mapRef.current as { invalidateSize: (o: unknown) => void }).invalidateSize({
            animate: false,
          });
          setLoading(false);
        }
      }, 600);
    }

    init().catch(() => {
      if (!destroyed) setLoading(false);
    });

    return () => {
      destroyed = true;
      ro?.disconnect();
      orientationCleanupRef.current?.();
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  function applyLocationOnMap(lat: number, lng: number) {
    const lMap = mapRef.current as {
      addLayer: (l: unknown) => void;
      removeLayer: (l: unknown) => void;
    };
    import("leaflet").then((L) => {
      // Cleanup previous orientation listener + markers
      orientationCleanupRef.current?.();
      orientationCleanupRef.current = null;
      if (compassMarkerRef.current) {
        lMap.removeLayer(compassMarkerRef.current as Parameters<typeof lMap.removeLayer>[0]);
        compassMarkerRef.current = null;
      }
      if (locateMarkerRef.current) {
        lMap.removeLayer(locateMarkerRef.current as Parameters<typeof lMap.removeLayer>[0]);
      }

      const locateColor =
        getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim() ||
        "#2d5a3d";

      // Cone: 100° arc, radial gradient — transparent inside dot (r=13px), peak at dot edge, fades to 0
      // SVG 100×100, center 50,50: dot edge = 13/50 = 0.26; peak at 0.30; arc 50° each side of up
      const coneHtml = `<svg width="100" height="100" viewBox="0 0 100 100" style="transform-origin:50px 50px"><defs><radialGradient id="cg" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${locateColor}" stop-opacity="0"/><stop offset="0.24" stop-color="${locateColor}" stop-opacity="0"/><stop offset="0.30" stop-color="${locateColor}" stop-opacity="0.55"/><stop offset="1" stop-color="${locateColor}" stop-opacity="0"/></radialGradient></defs><path d="M50 50 L11 18 A50 50 0 0 1 89 18 Z" fill="url(#cg)"/></svg>`;
      const coneIcon = L.divIcon({
        html: coneHtml,
        className: "",
        iconSize: [100, 100],
        iconAnchor: [50, 50],
      });
      const compassMarker = L.marker([lat, lng], {
        icon: coneIcon,
        interactive: false,
        zIndexOffset: -10,
      });
      compassMarker.addTo(lMap as ReturnType<typeof L.map>);
      compassMarkerRef.current = compassMarker;
      const svgEl = (compassMarker as { getElement?: () => HTMLElement | null })
        .getElement?.()
        ?.querySelector("svg");

      // Dot: divIcon (DOM layer) — stays fixed pixel size during zoom animation, unlike circleMarker (SVG layer)
      const dotHtml = `<div style="width:20px;height:20px;border-radius:50%;background:${locateColor};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);box-sizing:content-box;"></div>`;
      const dotIcon = L.divIcon({
        html: dotHtml,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const dotMarker = L.marker([lat, lng], {
        icon: dotIcon,
        interactive: false,
        zIndexOffset: 10,
      }).addTo(lMap as ReturnType<typeof L.map>);
      locateMarkerRef.current = dotMarker;

      (lMap as ReturnType<typeof L.map>).setView([lat, lng], 15, { animate: true, duration: 0.4 });
      setLocating(false);

      // Device orientation → rotate compass cone
      if (!svgEl) return;

      // Apply last known heading immediately so cone doesn't flash to north on re-press
      if (lastHeadingRef.current !== null) {
        (svgEl as SVGSVGElement).style.transform = `rotate(${lastHeadingRef.current}deg)`;
      }

      function startOrientation() {
        const handler = (e: DeviceOrientationEvent) => {
          if (e.alpha !== null) {
            lastHeadingRef.current = e.alpha;
            (svgEl as SVGSVGElement).style.transform = `rotate(${e.alpha}deg)`;
          }
        };
        window.addEventListener("deviceorientation", handler);
        orientationCleanupRef.current = () =>
          window.removeEventListener("deviceorientation", handler);
      }
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (typeof DOE.requestPermission === "function") {
        // iOS 13+ requires explicit permission from user gesture
        DOE.requestPermission()
          .then((perm) => {
            if (perm === "granted") startOrientation();
          })
          .catch(() => {});
      } else if (typeof DeviceOrientationEvent !== "undefined") {
        startOrientation();
      }
    });
  }

  function handleLocate() {
    if (!mapRef.current || locating) return;
    setLocating(true);
    setLocateError(null);

    const tgWA = getTelegramWebApp();
    const lm = tgWA?.LocationManager;

    // Telegram Desktop не имеет LocationManager — геолокация только в мобильном приложении
    if (tgWA && !lm) {
      setLocating(false);
      setLocateError("Геолокация доступна только в мобильном Telegram");
      return;
    }

    if (lm) {
      // Telegram LocationManager API (Bot API 8.0+)
      const doRequest = () => {
        lm.getLocation((loc) => {
          if (loc) {
            applyLocationOnMap(loc.latitude, loc.longitude);
          } else {
            setLocating(false);
            setLocateError(
              lm.isAccessGranted
                ? "Геолокация временно недоступна"
                : "Разрешите геолокацию: Настройки Telegram → Конфиденциальность → Местоположение",
            );
          }
        });
      };
      if (!lm.isInited) {
        lm.init(doRequest);
      } else {
        doRequest();
      }
      return;
    }

    // Fallback: browser geolocation (Telegram Desktop без LocationManager, обычный браузер)
    if (!navigator.geolocation) {
      setLocating(false);
      setLocateError("Геолокация не поддерживается Вашим браузером");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyLocationOnMap(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocating(false);
        if (err.code === 1) {
          setLocateError("Разрешите геолокацию в настройках браузера");
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

      const winL = (window as unknown as { L?: { MarkerClusterGroup?: unknown } }).L;
      const lAny = L as unknown as { MarkerClusterGroup?: unknown };
      const MC = winL?.MarkerClusterGroup ?? lAny.MarkerClusterGroup;

      if (MC) {
        const GroupClass = MC as new () => { addLayer: (l: unknown) => void };
        const group = new GroupClass();
        for (const ride of rideList) {
          const cardState = getRideCardState(ride, myUserId, requestMap, viewedRides);
          const dotColor = getRideCardBorderColor(cardState) ?? colorPrimary;
          const dotIcon = L.divIcon({
            className: "",
            html: `<div style="width:10px;height:10px;border-radius:50%;background:${dotColor};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25)"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
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
          const cardState = getRideCardState(ride, myUserId, requestMap, viewedRides);
          const icon = L.divIcon({
            className: "",
            html: makeRideMarkerHtml(ride, cardState),
            iconSize: [134, 46],
            iconAnchor: [67, 51],
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
        const cardState = getRideCardState(ride, myUserId, requestMap, viewedRides);
        const icon = L.divIcon({
          className: "",
          html: makeRideMarkerHtml(ride, cardState),
          iconSize: [134, 46],
          iconAnchor: [67, 51],
        });
        const marker = L.marker([ride.from_lat, ride.from_lng], { icon }).addTo(lMap);
        marker.on("click", () => setSelected(ride));
        markersRef.current.push(marker);
      }
    }
  }

  const seatsLeft = selected ? selected.seats_total - selected.seats_taken : 0;
  const selectedCardState = selected
    ? getRideCardState(selected, myUserId, requestMap, viewedRides)
    : "default";
  const selectedCardBg =
    selectedCardState === "default"
      ? isDark
        ? "rgba(28,28,30,0.92)"
        : "rgba(255,255,255,0.96)"
      : getRideCardBg(selectedCardState);
  const selectedBorderColor =
    getRideCardBorderColor(selectedCardState) ??
    (isDark ? "rgba(255,255,255,0.08)" : "var(--brand-line, rgba(15,23,42,0.06))");

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
        height,
        overflow: "hidden",
        background: "var(--brand-bg)",
      }}
    >
      {loading && (
        <div
          data-testid="map-loading"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1001,
            background: "var(--brand-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ ...glassStyle, borderRadius: 20, padding: "6px 14px", fontSize: 13 }}>
            Загрузка карты...
          </div>
        </div>
      )}

      <div
        ref={mapContainerRef}
        data-testid="leaflet-container"
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      />

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
            onClick={() => {
              setViewedRides((prev) => markRideViewed(selected.id, prev));
              navigate(`/rides/${selected.id}`);
            }}
            style={{
              width: "100%",
              textAlign: "left",
              ...glassStyle,
              background: selectedCardBg,
              borderRadius: 16,
              padding: "16px 44px 16px 16px",
              border: `1px solid ${selectedBorderColor}`,
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
