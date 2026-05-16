import { useEffect, useRef, useState } from "react";

interface Props {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
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

export function RouteMapLeaflet({ fromLat, fromLng, toLat, toLng, height = 180 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const isDark = useDarkMode();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let destroyed = false;

    const cs = getComputedStyle(document.documentElement);
    const colorFrom = cs.getPropertyValue("--brand-primary").trim() || "#2d5a3d";
    const colorTo = cs.getPropertyValue("--brand-danger").trim() || "#b53d3d";

    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        subdomains: "abc",
        className: isDark ? "leaflet-tile-dark" : "",
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
      L.polyline(
        [
          [fromLat, fromLng],
          [toLat, toLng],
        ],
        {
          color: colorFrom,
          weight: 2.5,
          opacity: 0.7,
          dashArray: "6 4",
        },
      ).addTo(map);

      const bounds = L.latLngBounds([
        [fromLat, fromLng],
        [toLat, toLng],
      ]);
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove();
        mapRef.current = null;
      }
    };
  }, [fromLat, fromLng, toLat, toLng, isDark]);

  return (
    <div
      ref={containerRef}
      style={{ height, borderRadius: 18, overflow: "hidden", background: "var(--brand-surface)" }}
    />
  );
}
