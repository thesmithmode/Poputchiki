import polyline from "@mapbox/polyline";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  routePolyline?: string | null | undefined;
  height?: number;
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

export function RouteMapLeaflet({
  fromLat,
  fromLng,
  toLat,
  toLng,
  routePolyline,
  height = 180,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const routeLayerRef = useRef<unknown>(null);
  const [routeRenderKey, setRouteRenderKey] = useState(0);
  const isDark = useDarkMode();

  const decodedRoute = useMemo(
    () => (routePolyline ? polyline.decode(routePolyline) : null),
    [routePolyline],
  );

  // Toggle dark filter via CSS class — no tile layer swap, no flicker
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.classList.toggle("leaflet-dark", isDark);
  }, [isDark]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let destroyed = false;

    const cs = getComputedStyle(document.documentElement);
    const colorFrom = cs.getPropertyValue("--route-from").trim() || "#3d6b8a";
    const colorTo = cs.getPropertyValue("--route-to").trim() || "#7c8694";

    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        touchZoom: false,
        doubleClickZoom: false,
        keyboard: false,
        boxZoom: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        subdomains: "abc",
      }).addTo(map);

      const iconFrom = L.divIcon({
        className: "",
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${colorFrom};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const iconTo = L.divIcon({
        className: "",
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${colorTo};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      L.marker([fromLat, fromLng], { icon: iconFrom }).addTo(map);
      L.marker([toLat, toLng], { icon: iconTo }).addTo(map);
      setRouteRenderKey((version) => version + 1);
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove();
        mapRef.current = null;
        routeLayerRef.current = null;
      }
    };
  }, [fromLat, fromLng, toLat, toLng]);

  useEffect(() => {
    if (!mapRef.current || routeRenderKey === 0) return;
    let cancelled = false;

    const cs = getComputedStyle(document.documentElement);
    const colorFrom = cs.getPropertyValue("--route-from").trim() || "#3d6b8a";

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      const map = mapRef.current as ReturnType<typeof L.map>;

      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current as Parameters<typeof map.removeLayer>[0]);
        routeLayerRef.current = null;
      }

      let routeLayer: unknown;
      if (decodedRoute) {
        routeLayer = L.polyline(decodedRoute as [number, number][], {
          color: colorFrom,
          weight: 3,
          opacity: 0.9,
        }).addTo(map);
        map.fitBounds(L.latLngBounds(decodedRoute as [number, number][]), {
          padding: [28, 28],
          maxZoom: 14,
        });
      } else {
        const fallbackPoints = [
          [fromLat, fromLng],
          [toLat, toLng],
        ] as [number, number][];
        routeLayer = L.polyline(fallbackPoints, {
          color: colorFrom,
          weight: 2.5,
          opacity: 0.65,
          dashArray: "6 5",
        }).addTo(map);
        map.fitBounds(L.latLngBounds(fallbackPoints), { padding: [28, 28], maxZoom: 14 });
      }
      routeLayerRef.current = routeLayer;
    });

    return () => {
      cancelled = true;
    };
  }, [fromLat, fromLng, toLat, toLng, decodedRoute, routeRenderKey]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        style={{ height, borderRadius: 18, overflow: "hidden", background: "var(--brand-surface)" }}
      />
      {!routePolyline && (
        <div
          data-testid="route-map-status"
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            padding: "5px 9px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.92)",
            color: "var(--brand-sub)",
            fontSize: 11,
            fontWeight: 600,
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          }}
        >
          Маршрут по дорогам строится
        </div>
      )}
    </div>
  );
}
