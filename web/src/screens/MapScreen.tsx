import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import polyline from "@mapbox/polyline";
import type { Map as LeafletMap } from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { applyFilters, resolveDateRange, useFilters } from "../hooks/useFilters";
import type { Filters } from "../hooks/useFilters";
import { useMe } from "../hooks/useMe";
import { useMyRideRequests } from "../hooks/useMyRideRequests";
import { compactAddressLabel, compactAddressTitle } from "../lib/addressFormat";
import { apiFetch } from "../lib/api";
import {
  type CompassHeading,
  type LocationFix,
  arrowRotationFromHeading,
  calculateMapOverscanSize,
  extractCompassHeading,
  getCompassCapability,
  mapBearingFromHeading,
  uprightRotationFromHeading,
} from "../lib/geolocation";
import {
  type RideCardState,
  getRideCardBg,
  getRideCardBorderColor,
  getRideCardState,
  markRideViewed,
  readViewedRideIds,
} from "../lib/rideCardState";
import { formatRouteMetrics } from "../lib/routeMetrics";
import { getTelegramWebApp } from "../lib/telegram";
import type { TelegramLocationData, TelegramLocationManager } from "../lib/telegram";
import type { Ride } from "../types/ride";

interface MapScreenProps {
  externalFilters?: Filters;
  height?: string;
  onRidesCount?: (n: number) => void;
}

const DEFAULT_CENTER: [number, number] = [55.76, 49.1];
const DEFAULT_ZOOM = 11;
const CLUSTER_THRESHOLD = 50;
const GROUP_MIN_SIZE = 2;

type SelectedRouteDetails = Pick<Ride, "route_polyline" | "route_distance_m" | "route_duration_s">;
type LocationMode = "idle" | "centered" | "headingUp";

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

function pluralTrip(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "поездок";
  if (mod10 === 1) return "поездка";
  if (mod10 >= 2 && mod10 <= 4) return "поездки";
  return "поездок";
}

function pluralDriver(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "водителей";
  if (mod10 === 1) return "водитель";
  if (mod10 >= 2 && mod10 <= 4) return "водителя";
  return "водителей";
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
  return `<div data-ride-card-marker="true" style="position:relative;background:${cardBg};border-radius:10px;padding:5px 8px;display:inline-flex;align-items:center;gap:6px;box-shadow:${boxShadow};cursor:pointer;border:1px solid ${borderColor};white-space:nowrap;max-width:180px"><div style="width:28px;height:28px;border-radius:50%;background:${avatarColor};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initials}</div><div style="min-width:0;overflow:hidden">${dateLine}<div style="font-size:12px;font-weight:700;color:var(--brand-text,#0e1410);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${time}&nbsp;&nbsp;${price}</div>${subLine}</div><div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid ${cardBg}"></div></div>`;
}

function makeRideGroupMarkerHtml(rides: Ride[]): string {
  const driverCount = new Set(rides.map((ride) => ride.driver_id)).size;
  const firstDeparture = rides
    .map((ride) => new Date(ride.departure_at).getTime())
    .sort((a, b) => a - b)[0];
  const firstTime = firstDeparture ? formatTime(new Date(firstDeparture).toISOString()) : "";
  const label = `${rides.length} ${pluralTrip(rides.length)}`;
  const subLabel = `${driverCount} ${pluralDriver(driverCount)}${firstTime ? ` · с ${firstTime}` : ""}`;
  return `<div data-ride-group-marker="true" style="position:relative;background:var(--brand-primary,#2d5a3d);border-radius:12px;padding:7px 10px;display:inline-flex;align-items:center;gap:8px;box-shadow:0 3px 14px rgba(0,0,0,.28);cursor:pointer;border:2px solid #fff;white-space:nowrap;max-width:190px;color:var(--brand-primary-ink,#fff)"><div style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">${rides.length}</div><div style="min-width:0;overflow:hidden"><div style="font-size:12px;font-weight:800;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(label)}</div><div style="font-size:10px;font-weight:600;opacity:.86;line-height:1.25;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(subLabel)}</div></div><div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid var(--brand-primary,#2d5a3d)"></div></div>`;
}

function makeCompactRideMarkerHtml(
  ride: Ride,
  cardState: RideCardState,
  headingDeg: number,
): string {
  const borderColor = getRideCardBorderColor(cardState) ?? "#fff";
  const bg = cardState === "default" ? "var(--brand-primary,#2d5a3d)" : getRideCardBg(cardState);
  const rotation = uprightRotationFromHeading(headingDeg);
  const time = escapeHtml(formatTime(ride.departure_at));
  return `<div data-map-upright="true" data-compact-ride-marker="true" style="width:46px;height:46px;transform-origin:23px 23px;transform:rotate(${rotation}deg);display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 7px rgba(0,0,0,.28))"><div style="width:38px;height:38px;border-radius:50% 50% 50% 10px;transform:rotate(-45deg);background:${bg};border:2px solid ${borderColor};display:flex;align-items:center;justify-content:center;color:var(--brand-primary-ink,#fff)"><span style="transform:rotate(45deg);font-size:10px;font-weight:800;line-height:1">${time}</span></div></div>`;
}

function makeCompactRideGroupMarkerHtml(count: number, headingDeg: number): string {
  const rotation = uprightRotationFromHeading(headingDeg);
  return `<div data-map-upright="true" data-compact-group-marker="true" style="width:48px;height:48px;transform-origin:24px 24px;transform:rotate(${rotation}deg);display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,.3))"><div style="width:40px;height:40px;border-radius:50%;background:var(--brand-primary,#2d5a3d);border:2px solid #fff;color:var(--brand-primary-ink,#fff);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900">${count}</div></div>`;
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
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const tileLayerRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const clusterGroupRef = useRef<unknown>(null);
  const selectedRouteRef = useRef<unknown>(null);
  const locateMarkerRef = useRef<unknown>(null);
  const accuracyCircleRef = useRef<unknown>(null);
  const compassMarkerRef = useRef<unknown>(null);
  const compassSvgRef = useRef<SVGSVGElement | null>(null);
  const currentLocationFixRef = useRef<LocationFix | null>(null);
  const orientationCleanupRef = useRef<(() => void) | null>(null);
  const continuousLocationCleanupRef = useRef<(() => void) | null>(null);
  const latestCompassHeadingRef = useRef<CompassHeading | null>(null);
  const locationModeRef = useRef<LocationMode>("idle");
  const loadRidesRef = useRef<(() => void) | null>(null);
  const filtersRef = useRef(filters);
  const selectedRef = useRef<Ride | null>(null);
  const ridesRef = useRef<Ride[]>([]);
  const renderedRidesRef = useRef<Ride[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [selected, setSelected] = useState<Ride | null>(null);
  const [selectedRouteDetails, setSelectedRouteDetails] = useState<SelectedRouteDetails | null>();
  const [selectedRouteLoading, setSelectedRouteLoading] = useState(false);
  const [viewedRides, setViewedRides] = useState<Set<string>>(readViewedRideIds);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [locationMode, setLocationModeState] = useState<LocationMode>("idle");
  const selectedCardRef = useRef<HTMLButtonElement>(null);
  const [selectedCardHeight, setSelectedCardHeight] = useState<number>(0);

  // Keep filtersRef in sync so loadRides always reads current filters without remounting map
  filtersRef.current = filters;
  selectedRef.current = selected;

  function setLocationMode(mode: LocationMode) {
    locationModeRef.current = mode;
    setLocationModeState(mode);
  }

  const clearRideMarkers = useCallback((map: LeafletMap) => {
    for (const marker of markersRef.current) {
      map.removeLayer(marker as Parameters<typeof map.removeLayer>[0]);
    }
    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current as Parameters<typeof map.removeLayer>[0]);
    }
    markersRef.current = [];
    clusterGroupRef.current = null;
  }, []);

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

  useEffect(() => {
    if (!selected) {
      setSelectedRouteDetails(undefined);
      setSelectedRouteLoading(false);
      return;
    }

    const seeded: SelectedRouteDetails = {
      route_polyline: selected.route_polyline ?? null,
      route_distance_m: selected.route_distance_m ?? null,
      route_duration_s: selected.route_duration_s ?? null,
    };
    setSelectedRouteDetails(seeded);

    const needsHydration =
      !seeded.route_polyline || !seeded.route_distance_m || !seeded.route_duration_s;
    if (!needsHydration) {
      setSelectedRouteLoading(false);
      return;
    }

    setSelectedRouteLoading(true);
    let cancelled = false;
    apiFetch<SelectedRouteDetails>(`/rides/${selected.id}`)
      .then((ride) => {
        if (!cancelled) {
          setSelectedRouteDetails({
            route_polyline: ride.route_polyline ?? null,
            route_distance_m: ride.route_distance_m ?? null,
            route_duration_s: ride.route_duration_s ?? null,
          });
          setSelectedRouteLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedRouteLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      const lMap = mapRef.current as ReturnType<typeof L.map>;
      if (selectedRouteRef.current) {
        lMap.removeLayer(selectedRouteRef.current as Parameters<typeof lMap.removeLayer>[0]);
        selectedRouteRef.current = null;
      }
      if (!selected) return;
      if (locationModeRef.current === "headingUp") {
        stopHeadingUpMode({ recenter: false });
      }
      clearRideMarkers(lMap);

      if (selectedRouteLoading && !selectedRouteDetails?.route_polyline) return;

      const selectedRoutePolyline = selectedRouteDetails?.route_polyline;
      const routePoints = selectedRoutePolyline
        ? (polyline.decode(selectedRoutePolyline) as [number, number][])
        : ([
            [selected.from_lat, selected.from_lng],
            [selected.to_lat, selected.to_lng],
          ] as [number, number][]);
      const color =
        getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim() ||
        "#2d5a3d";
      const line = L.polyline(
        routePoints,
        selectedRoutePolyline
          ? { color, weight: 4, opacity: 0.85, lineCap: "round", lineJoin: "round" }
          : { color, weight: 2.5, opacity: 0.55, dashArray: "6 5" },
      ).addTo(lMap);
      selectedRouteRef.current = line;
      const topPad = 70;
      const sidePad = 60;
      const viewportH = window.innerHeight || 800;
      const safeBottomPad = Math.min(Math.floor(viewportH * 0.55), selectedCardHeight + 44);
      const bottomPad = Math.min(420, Math.max(220, safeBottomPad)); // keep route visible above the selected card
      lMap.fitBounds(L.latLngBounds(routePoints), {
        paddingTopLeft: [sidePad, topPad],
        paddingBottomRight: [sidePad, bottomPad],
        maxZoom: 14,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selected, selectedRouteDetails, selectedRouteLoading, clearRideMarkers, selectedCardHeight]);

  useEffect(() => {
    if (!selected) {
      setSelectedCardHeight(0);
      return;
    }
    if (!selectedCardRef.current) return;

    const el = selectedCardRef.current;
    const update = () => setSelectedCardHeight(el.getBoundingClientRect().height);
    update();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => update()) : null;
    resizeObserver?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [selected]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: renderMarkers reads current user/request/viewed state through closure
  useEffect(() => {
    if (!mapRef.current || rides.length === 0) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (!cancelled && mapRef.current) {
        if (selectedRef.current) clearRideMarkers(mapRef.current as LeafletMap);
        else renderMarkers(mapRef.current, L, rides);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rides, requestMap, viewedRides, myUserId, selected, clearRideMarkers]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Leaflet DOM must be refreshed after React commits locationMode.
  useEffect(() => {
    if (!mapRef.current || selectedRef.current) return;
    const id = window.setTimeout(() => {
      if (!mapRef.current || selectedRef.current) return;
      if (locationModeRef.current === "headingUp" && currentLocationFixRef.current) {
        applyLocationOnMap(currentLocationFixRef.current, { recenter: false });
      }
      rerenderRideMarkers();
    }, 0);
    return () => window.clearTimeout(id);
  }, [locationMode]);

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
        if (selectedRouteRef.current) {
          (mapRef.current as { removeLayer: (l: unknown) => void }).removeLayer(
            selectedRouteRef.current,
          );
          selectedRouteRef.current = null;
        }
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
          applyMapStageLayout();
          invalidateMapStage(locationModeRef.current === "headingUp");
        }
      });

      const tile = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
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
        if (destroyed || selectedRef.current) return;
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
            ridesRef.current = filtered;
            renderedRidesRef.current = filtered;
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
        if (selectedRef.current) return;
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
      if (typeof ResizeObserver !== "undefined" && mapViewportRef.current) {
        ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry || destroyed) return;
          const { width, height } = entry.contentRect;
          if (width === prevW && height === prevH) return;
          prevW = width;
          prevH = height;
          if (mapRef.current) {
            applyMapStageLayout();
            invalidateMapStage(locationModeRef.current === "headingUp");
          }
        });
        ro.observe(mapViewportRef.current);
      }

      // Start loading tiles + data, but keep overlay until 600ms (Telegram expand animation).
      setTimeout(() => {
        if (!destroyed) {
          applyMapStageLayout();
          map.invalidateSize();
          loadRides();
        }
      }, 100);

      // 600ms: Telegram has finished expanding → map is correctly sized → safe to hide overlay.
      setTimeout(() => {
        if (!destroyed && mapRef.current) {
          applyMapStageLayout();
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
      continuousLocationCleanupRef.current?.();
      orientationCleanupRef.current = null;
      continuousLocationCleanupRef.current = null;
      currentLocationFixRef.current = null;
      latestCompassHeadingRef.current = null;
      compassSvgRef.current = null;
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  function compassConeHtml(locateColor: string, headingDeg: number): string {
    return `<svg width="100" height="100" viewBox="0 0 100 100" style="transform-origin:50px 50px;transform:rotate(${headingDeg}deg)"><defs><radialGradient id="cg" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${locateColor}" stop-opacity="0"/><stop offset="0.24" stop-color="${locateColor}" stop-opacity="0"/><stop offset="0.30" stop-color="${locateColor}" stop-opacity="0.55"/><stop offset="1" stop-color="${locateColor}" stop-opacity="0"/></radialGradient></defs><path d="M50 50 L11 18 A50 50 0 0 1 89 18 Z" fill="url(#cg)"/></svg>`;
  }

  function locationArrowHtml(locateColor: string, headingDeg: number): string {
    const rotation = arrowRotationFromHeading(headingDeg);
    return `<svg data-heading-arrow="true" width="34" height="34" viewBox="0 0 34 34" style="transform-origin:17px 17px;transform:rotate(${rotation}deg);filter:drop-shadow(0 1px 4px rgba(0,0,0,0.35))"><path d="M17 3 L28 30 L17 24 L6 30 Z" fill="${locateColor}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;
  }

  function locationDotHtml(locateColor: string): string {
    return `<div style="width:20px;height:20px;border-radius:50%;background:${locateColor};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);box-sizing:content-box;"></div>`;
  }

  function locationMarkerHtml(locateColor: string): string {
    if (locationModeRef.current !== "headingUp") return locationDotHtml(locateColor);
    const heading = latestCompassHeadingRef.current;
    return locationArrowHtml(locateColor, heading ? heading.headingDeg : 0);
  }

  function getMapViewportSize(): { width: number; height: number } {
    const viewport = mapViewportRef.current;
    const rect = viewport?.getBoundingClientRect();
    const width = rect?.width || viewport?.clientWidth || window.innerWidth || 0;
    const height = rect?.height || viewport?.clientHeight || window.innerHeight || 0;
    return { width, height };
  }

  function applyMapStageLayout() {
    const stage = mapContainerRef.current;
    if (!stage) return;

    if (locationModeRef.current !== "headingUp") {
      stage.style.width = "100%";
      stage.style.height = "100%";
      stage.style.left = "0px";
      stage.style.top = "0px";
      return;
    }

    const { width, height } = getMapViewportSize();
    const stageSize = calculateMapOverscanSize(width, height);
    stage.style.width = `${stageSize}px`;
    stage.style.height = `${stageSize}px`;
    stage.style.left = `${(width - stageSize) / 2}px`;
    stage.style.top = `${(height - stageSize) / 2}px`;
  }

  function invalidateMapStage(recenter = false) {
    const lMap = mapRef.current as {
      invalidateSize?: (options: unknown) => void;
      getZoom?: () => number;
      setView?: (coords: [number, number], zoom: number, options: unknown) => void;
    } | null;
    lMap?.invalidateSize?.({ animate: false });
    const fix = currentLocationFixRef.current;
    if (recenter && fix) {
      lMap?.setView?.([fix.lat, fix.lng], lMap.getZoom?.() ?? 15, { animate: false });
    }
  }

  function applyMapBearing(heading: CompassHeading) {
    if (locationModeRef.current !== "headingUp" || !mapContainerRef.current) return;
    const bearing = mapBearingFromHeading(heading.headingDeg);
    applyMapStageLayout();
    mapContainerRef.current.style.transformOrigin = "50% 50%";
    mapContainerRef.current.style.transition = "transform 120ms linear";
    mapContainerRef.current.style.transform = `rotate(${bearing}deg)`;
  }

  function resetMapBearing() {
    if (!mapContainerRef.current) return;
    applyMapStageLayout();
    mapContainerRef.current.style.transformOrigin = "50% 50%";
    mapContainerRef.current.style.transition = "transform 120ms linear";
    mapContainerRef.current.style.transform = "rotate(0deg)";
    invalidateMapStage(false);
  }

  function setMapDragging(enabled: boolean) {
    const lMap = mapRef.current as {
      dragging?: { enable?: () => void; disable?: () => void };
    } | null;
    if (enabled) lMap?.dragging?.enable?.();
    else lMap?.dragging?.disable?.();
  }

  function updateLocationArrow(heading: CompassHeading) {
    const markerEl = (locateMarkerRef.current as { getElement?: () => HTMLElement | null } | null)
      ?.getElement?.()
      ?.querySelector("[data-heading-arrow]") as SVGElement | null;
    if (!markerEl) return;
    markerEl.style.transform = `rotate(${arrowRotationFromHeading(heading.headingDeg)}deg)`;
  }

  function updateUprightMarkerRotation(heading: CompassHeading) {
    const rotation = uprightRotationFromHeading(heading.headingDeg);
    const uprightMarkers =
      mapContainerRef.current?.querySelectorAll<HTMLElement>("[data-map-upright]") ?? [];
    for (const el of uprightMarkers) {
      el.style.transform = `rotate(${rotation}deg)`;
    }
  }

  function renderCompassHeading(heading: CompassHeading) {
    latestCompassHeadingRef.current = heading;
    const fix = currentLocationFixRef.current;
    if (!fix || !mapRef.current) return;
    if (locationModeRef.current === "headingUp") {
      if (compassMarkerRef.current) {
        import("leaflet").then((L) => {
          if (!mapRef.current || !compassMarkerRef.current) return;
          const lMap = mapRef.current as ReturnType<typeof L.map>;
          lMap.removeLayer(compassMarkerRef.current as Parameters<typeof lMap.removeLayer>[0]);
          compassMarkerRef.current = null;
          compassSvgRef.current = null;
        });
      }
      applyMapBearing(heading);
      updateLocationArrow(heading);
      updateUprightMarkerRotation(heading);
      return;
    }

    import("leaflet").then((L) => {
      if (!mapRef.current || currentLocationFixRef.current !== fix) return;
      const lMap = mapRef.current as ReturnType<typeof L.map>;
      const rotate = `rotate(${heading.headingDeg}deg)`;

      if (compassSvgRef.current) {
        compassSvgRef.current.style.transform = rotate;
        return;
      }
      if (compassMarkerRef.current) {
        lMap.removeLayer(compassMarkerRef.current as Parameters<typeof lMap.removeLayer>[0]);
        compassMarkerRef.current = null;
      }

      const locateColor =
        getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim() ||
        "#2d5a3d";
      const coneIcon = L.divIcon({
        html: compassConeHtml(locateColor, heading.headingDeg),
        className: "",
        iconSize: [100, 100],
        iconAnchor: [50, 50],
      });
      const compassMarker = L.marker([fix.lat, fix.lng], {
        icon: coneIcon,
        interactive: false,
        zIndexOffset: -10,
      }).addTo(lMap);
      compassMarkerRef.current = compassMarker;
      const svgEl = (compassMarker as { getElement?: () => HTMLElement | null })
        .getElement?.()
        ?.querySelector("svg");
      compassSvgRef.current = svgEl as SVGSVGElement | null;
      if (compassSvgRef.current) {
        compassSvgRef.current.style.transform = rotate;
      }
    });
  }

  function stopContinuousLocationTracking() {
    continuousLocationCleanupRef.current?.();
    continuousLocationCleanupRef.current = null;
  }

  function telegramLocationToFix(loc: TelegramLocationData): LocationFix {
    return {
      lat: loc.latitude,
      lng: loc.longitude,
      accuracyM:
        typeof loc.horizontal_accuracy === "number" && Number.isFinite(loc.horizontal_accuracy)
          ? loc.horizontal_accuracy
          : null,
      source: "telegram",
    };
  }

  function browserPositionToFix(pos: GeolocationPosition): LocationFix {
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM:
        typeof pos.coords.accuracy === "number" && Number.isFinite(pos.coords.accuracy)
          ? pos.coords.accuracy
          : null,
      source: "browser",
    };
  }

  function startContinuousLocationTracking(lm: TelegramLocationManager | undefined) {
    stopContinuousLocationTracking();

    if (lm) {
      const pollTelegramLocation = () => {
        lm.getLocation((loc) => {
          if (!loc || locationModeRef.current !== "headingUp") return;
          applyLocationOnMap(telegramLocationToFix(loc));
        });
      };
      pollTelegramLocation();
      const id = window.setInterval(pollTelegramLocation, 2000);
      continuousLocationCleanupRef.current = () => window.clearInterval(id);
      return;
    }

    const geo = navigator.geolocation;
    if (!geo) return;

    if (typeof geo.watchPosition === "function") {
      const watchId = geo.watchPosition(
        (pos) => {
          if (locationModeRef.current !== "headingUp") return;
          applyLocationOnMap(browserPositionToFix(pos));
        },
        () => {},
        { timeout: 10000, enableHighAccuracy: true, maximumAge: 1000 },
      );
      continuousLocationCleanupRef.current = () => geo.clearWatch(watchId);
      return;
    }

    const pollBrowserLocation = () => {
      geo.getCurrentPosition(
        (pos) => {
          if (locationModeRef.current !== "headingUp") return;
          applyLocationOnMap(browserPositionToFix(pos));
        },
        () => {},
        { timeout: 10000, enableHighAccuracy: true, maximumAge: 1000 },
      );
    };
    pollBrowserLocation();
    const id = window.setInterval(pollBrowserLocation, 2000);
    continuousLocationCleanupRef.current = () => window.clearInterval(id);
  }

  function rerenderRideMarkers() {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      if (!mapRef.current || selectedRef.current) return;
      const rideList = ridesRef.current.length > 0 ? ridesRef.current : renderedRidesRef.current;
      if (rideList.length === 0) return;
      renderMarkers(mapRef.current, L, rideList);
    });
  }

  function stopHeadingUpMode(options: { recenter?: boolean } = {}) {
    stopContinuousLocationTracking();
    setMapDragging(true);
    setLocationMode("idle");
    resetMapBearing();
    const fix = currentLocationFixRef.current;
    if (fix) applyLocationOnMap(fix, { recenter: options.recenter ?? true });
    window.setTimeout(() => rerenderRideMarkers(), 0);
  }

  function enableHeadingUpMode(lm: TelegramLocationManager | undefined) {
    const fix = currentLocationFixRef.current;
    const heading = latestCompassHeadingRef.current;
    if (!fix || !heading) {
      setLocateError("Компас недоступен");
      return;
    }

    setLocationMode("headingUp");
    setMapDragging(false);
    applyMapBearing(heading);
    invalidateMapStage(true);
    applyLocationOnMap(fix);
    window.setTimeout(() => rerenderRideMarkers(), 0);
    const trackingStartId = window.setTimeout(() => {
      if (locationModeRef.current === "headingUp") {
        startContinuousLocationTracking(lm);
      }
    }, 0);
    continuousLocationCleanupRef.current = () => window.clearTimeout(trackingStartId);
  }

  function startCompassTracking() {
    orientationCleanupRef.current?.();
    orientationCleanupRef.current = null;
    latestCompassHeadingRef.current = null;
    compassSvgRef.current = null;

    if (!getCompassCapability().eligible) return;
    if (typeof DeviceOrientationEvent === "undefined") return;

    const start = () => {
      const handler = (event: Event) => {
        const heading = extractCompassHeading(event as DeviceOrientationEvent);
        if (heading) renderCompassHeading(heading);
      };
      window.addEventListener("deviceorientation", handler);
      window.addEventListener("deviceorientationabsolute", handler);
      orientationCleanupRef.current = () => {
        window.removeEventListener("deviceorientation", handler);
        window.removeEventListener("deviceorientationabsolute", handler);
      };
    };

    const orientationEvent = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof orientationEvent.requestPermission === "function") {
      void orientationEvent
        .requestPermission()
        .then((permission) => {
          if (permission === "granted") start();
        })
        .catch(() => {});
      return;
    }

    start();
  }

  function applyLocationOnMap(fix: LocationFix, options: { recenter?: boolean } = {}) {
    currentLocationFixRef.current = fix;
    if (locationModeRef.current === "idle") setLocationMode("centered");
    import("leaflet").then((L) => {
      if (!mapRef.current || currentLocationFixRef.current !== fix) return;
      const lMap = mapRef.current as ReturnType<typeof L.map>;
      // Cleanup previous location layers; the active compass subscription stays alive.
      if (compassMarkerRef.current) {
        lMap.removeLayer(compassMarkerRef.current as Parameters<typeof lMap.removeLayer>[0]);
        compassMarkerRef.current = null;
      }
      if (locateMarkerRef.current) {
        lMap.removeLayer(locateMarkerRef.current as Parameters<typeof lMap.removeLayer>[0]);
        locateMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        lMap.removeLayer(accuracyCircleRef.current as Parameters<typeof lMap.removeLayer>[0]);
        accuracyCircleRef.current = null;
      }
      compassSvgRef.current = null;

      const locateColor =
        getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim() ||
        "#2d5a3d";

      // Accuracy radius: show coarse fixes as coarse, not as an exact point.
      if (fix.accuracyM !== null && fix.accuracyM > 0) {
        const accuracyCircle = L.circle([fix.lat, fix.lng], {
          radius: fix.accuracyM,
          color: locateColor,
          opacity: 0.28,
          weight: 1,
          fillColor: locateColor,
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(lMap);
        accuracyCircleRef.current = accuracyCircle;
      }

      // Dot: divIcon (DOM layer) — stays fixed pixel size during zoom animation, unlike circleMarker (SVG layer)
      const isHeadingUp = locationModeRef.current === "headingUp";
      const dotIcon = L.divIcon({
        html: locationMarkerHtml(locateColor),
        className: "",
        iconSize: isHeadingUp ? [34, 34] : [26, 26],
        iconAnchor: isHeadingUp ? [17, 17] : [13, 13],
      });
      const dotMarker = L.marker([fix.lat, fix.lng], {
        icon: dotIcon,
        interactive: false,
        zIndexOffset: 10,
      }).addTo(lMap);
      locateMarkerRef.current = dotMarker;

      if (options.recenter ?? true) {
        lMap.setView([fix.lat, fix.lng], 15, {
          animate: true,
          duration: 0.4,
        });
      }
      setLocating(false);

      // Compass cone appears only after a real heading event.
      const heading = latestCompassHeadingRef.current;
      if (heading) renderCompassHeading(heading);
    });
  }

  function handleLocate() {
    if (!mapRef.current || locating) return;

    const tgWA = getTelegramWebApp();
    const lm = tgWA?.LocationManager;

    if (locationModeRef.current === "headingUp") {
      stopHeadingUpMode();
      setLocateError(null);
      return;
    }

    if (locationModeRef.current === "centered") {
      const capability = getCompassCapability();
      if (capability.eligible) {
        setLocateError(null);
        if (latestCompassHeadingRef.current) {
          enableHeadingUpMode(lm);
        } else {
          setLocateError("Компас недоступен");
        }
        return;
      }
    }

    setLocating(true);
    setLocateError(null);

    // Telegram Desktop не имеет LocationManager — геолокация только в мобильном приложении
    if (tgWA && !lm && !navigator.geolocation) {
      setLocating(false);
      setLocateError("Геолокация доступна только в мобильном Telegram");
      return;
    }

    if (!lm && !navigator.geolocation) {
      setLocating(false);
      setLocateError("Геолокация не поддерживается Вашим браузером");
      return;
    }

    if (getCompassCapability().eligible) startCompassTracking();

    if (lm) {
      // Telegram LocationManager API (Bot API 8.0+)
      const doRequest = () => {
        lm.getLocation((loc) => {
          if (loc) {
            applyLocationOnMap(telegramLocationToFix(loc));
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
        applyLocationOnMap(browserPositionToFix(pos));
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

    clearRideMarkers(lMap);

    const isHeadingUp = locationModeRef.current === "headingUp";
    const headingDeg = latestCompassHeadingRef.current?.headingDeg ?? 0;
    const zoom = (lMap as unknown as { getZoom?: () => number }).getZoom?.() ?? DEFAULT_ZOOM;
    const groupRadiusPx = Math.max(24, 80 - Math.max(0, zoom - DEFAULT_ZOOM) * 8);
    const toPoint = (ride: Ride): { x: number; y: number } => {
      const projector = lMap as unknown as {
        latLngToLayerPoint?: (coords: [number, number]) => { x: number; y: number };
      };
      const projected = projector.latLngToLayerPoint?.([ride.from_lat, ride.from_lng]);
      if (projected) return projected;
      return { x: ride.from_lng * 100000, y: ride.from_lat * 100000 };
    };

    const groups: { rides: Ride[]; x: number; y: number; lat: number; lng: number }[] = [];
    for (const ride of rideList) {
      const point = toPoint(ride);
      const existing = groups.find(
        (group) => Math.hypot(group.x - point.x, group.y - point.y) <= groupRadiusPx,
      );
      if (existing) {
        existing.rides.push(ride);
        const n = existing.rides.length;
        existing.x = (existing.x * (n - 1) + point.x) / n;
        existing.y = (existing.y * (n - 1) + point.y) / n;
        existing.lat = (existing.lat * (n - 1) + ride.from_lat) / n;
        existing.lng = (existing.lng * (n - 1) + ride.from_lng) / n;
      } else {
        groups.push({
          rides: [ride],
          x: point.x,
          y: point.y,
          lat: ride.from_lat,
          lng: ride.from_lng,
        });
      }
    }

    const singles: Ride[] = [];
    for (const group of groups) {
      if (group.rides.length < GROUP_MIN_SIZE) {
        singles.push(...group.rides);
        continue;
      }
      const icon = L.divIcon({
        className: "",
        html: isHeadingUp
          ? makeCompactRideGroupMarkerHtml(group.rides.length, headingDeg)
          : makeRideGroupMarkerHtml(group.rides),
        iconSize: isHeadingUp ? [48, 48] : [142, 52],
        iconAnchor: isHeadingUp ? [24, 48] : [71, 58],
      });
      const marker = L.marker([group.lat, group.lng], { icon }).addTo(lMap);
      marker.on("click", () => {
        navigate("/", {
          state: {
            mapRideGroup: {
              rideIds: group.rides.map((ride) => ride.id),
              fromLabel: group.rides[0]?.from_label ?? "",
              count: group.rides.length,
            },
          },
        });
      });
      markersRef.current.push(marker);
    }

    if (!singles.length) return;

    if (singles.length >= CLUSTER_THRESHOLD) {
      // At high density use simple dots inside clusters for performance
      const cs = getComputedStyle(document.documentElement);
      const colorPrimary = cs.getPropertyValue("--brand-primary").trim() || "#2d5a3d";

      const winL = (window as unknown as { L?: { MarkerClusterGroup?: unknown } }).L;
      const lAny = L as unknown as { MarkerClusterGroup?: unknown };
      const MC = winL?.MarkerClusterGroup ?? lAny.MarkerClusterGroup;

      if (MC) {
        const GroupClass = MC as new () => { addLayer: (l: unknown) => void };
        const group = new GroupClass();
        for (const ride of singles) {
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
        for (const ride of singles) {
          const cardState = getRideCardState(ride, myUserId, requestMap, viewedRides);
          const icon = L.divIcon({
            className: "",
            html: isHeadingUp
              ? makeCompactRideMarkerHtml(ride, cardState, headingDeg)
              : makeRideMarkerHtml(ride, cardState),
            iconSize: isHeadingUp ? [46, 46] : [134, 46],
            iconAnchor: isHeadingUp ? [23, 46] : [67, 51],
          });
          const marker = L.marker([ride.from_lat, ride.from_lng], { icon }).addTo(lMap);
          marker.on("click", () => setSelected(ride));
          markersRef.current.push(marker);
        }
      }
    } else {
      // Rich ride-card markers — no route polylines on global map
      clusterGroupRef.current = null;
      for (const ride of singles) {
        const cardState = getRideCardState(ride, myUserId, requestMap, viewedRides);
        const icon = L.divIcon({
          className: "",
          html: isHeadingUp
            ? makeCompactRideMarkerHtml(ride, cardState, headingDeg)
            : makeRideMarkerHtml(ride, cardState),
          iconSize: isHeadingUp ? [46, 46] : [134, 46],
          iconAnchor: isHeadingUp ? [23, 46] : [67, 51],
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
  const selectedRouteMetrics = selected
    ? formatRouteMetrics(
        selectedRouteDetails?.route_distance_m ?? selected.route_distance_m,
        selectedRouteDetails?.route_duration_s ?? selected.route_duration_s,
      )
    : null;
  const selectedFromLabel = selected
    ? compactAddressLabel(selected.from_label, { maxLen: 28 })
    : "";
  const selectedToLabel = selected ? compactAddressLabel(selected.to_label, { maxLen: 28 }) : "";
  const selectedFromTitle = selected
    ? compactAddressTitle(selected.from_label, selectedFromLabel)
    : undefined;
  const selectedToTitle = selected
    ? compactAddressTitle(selected.to_label, selectedToLabel)
    : undefined;

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
        ref={mapViewportRef}
        data-testid="leaflet-viewport"
        style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden" }}
      >
        <div
          ref={mapContainerRef}
          data-testid="leaflet-container"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            willChange: "transform",
          }}
        />
      </div>

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
          aria-pressed={locationMode === "headingUp"}
          onClick={handleLocate}
          style={{
            ...zoomBtnBase,
            ...glassStyle,
            fontSize: 16,
            ...(locationMode === "headingUp"
              ? {
                  background: "var(--brand-primary, #2d5a3d)",
                  color: "var(--brand-primary-ink, #fff)",
                  borderColor: "var(--brand-primary, #2d5a3d)",
                }
              : null),
          }}
        >
          {locating ? "…" : locationMode === "headingUp" ? "▲" : "◎"}
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
            bottom: 76,
            left: 12,
            right: 12,
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            data-testid="selected-ride-card"
            ref={selectedCardRef}
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
              padding: "12px 44px 12px 12px",
              border: `1px solid ${selectedBorderColor}`,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 650,
                marginBottom: 6,
                lineHeight: 1.25,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={selectedFromTitle}
            >
              {selectedFromLabel}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--brand-sub, #6b716e)",
                marginBottom: 8,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={selectedToTitle}
            >
              → {selectedToLabel}
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 13, fontWeight: 600 }}>
              <span>{selected.price_rub !== null ? `${selected.price_rub} ₽` : "Договорная"}</span>
              <span
                style={{ color: seatsLeft === 0 ? "var(--brand-danger)" : "var(--brand-primary)" }}
              >
                {seatsLeft === 0 ? "Нет мест" : `${seatsLeft} мест`}
              </span>
              {selectedRouteMetrics && (
                <span style={{ color: "var(--brand-sub, #6b716e)" }}>{selectedRouteMetrics}</span>
              )}
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
