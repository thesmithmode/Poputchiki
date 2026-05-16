import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import type { Coords } from "./AddressAutocomplete";

interface MapPickerProps {
  open: boolean;
  initialCoords?: Coords | null;
  title: string;
  onClose: () => void;
  onPick: (label: string, coords: Coords) => void;
}

interface ReverseResult {
  display_name?: string;
  lat?: string;
  lon?: string;
  error?: string;
}

// Центр ЖК Царёво Village. fallback если у пользователя нет initialCoords и нет permission на геолокацию.
const TSAREVO_CENTER: Coords = { lat: 55.8112, lng: 49.4395 };

export function MapPicker({
  open,
  initialCoords,
  title,
  onClose,
  onPick,
}: MapPickerProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const [picked, setPicked] = useState<{ coords: Coords; label: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !containerRef.current || mapRef.current) return;
    let destroyed = false;
    const start = initialCoords ?? TSAREVO_CENTER;

    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([start.lat, start.lng], initialCoords ? 16 : 13);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        subdomains: "abc",
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#2d5a3d;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      if (initialCoords) {
        markerRef.current = L.marker([initialCoords.lat, initialCoords.lng], { icon }).addTo(map);
      }

      map.on("click", async (e: { latlng: { lat: number; lng: number } }) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        if (markerRef.current) {
          (markerRef.current as { setLatLng(p: [number, number]): void }).setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        }
        setResolving(true);
        setError(null);
        try {
          const res = await apiFetch<ReverseResult>(
            `/geocode/reverse?lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`,
          );
          if (res.error) {
            setError("Точка вне рабочей зоны");
            setPicked(null);
          } else {
            const label =
              res.display_name?.split(",").slice(0, 4).join(",").trim() ||
              `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            setPicked({ coords: { lat, lng }, label });
          }
        } catch {
          setError("Геокодер недоступен");
          setPicked(null);
        } finally {
          setResolving(false);
        }
      });
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [open, initialCoords]);

  if (!open) return null;

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: <dialog> требует showModal()/close() императива, мы управляем через React-проп open
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "var(--brand-bg, #fff)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid var(--brand-line, #e5e5e5)",
          background: "var(--brand-surface, #fff)",
        }}
      >
        <button
          type="button"
          data-testid="map-picker-close"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            fontSize: 22,
            cursor: "pointer",
            padding: 4,
          }}
          aria-label="Закрыть"
        >
          ✕
        </button>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
      </div>
      <div ref={containerRef} data-testid="map-picker-canvas" style={{ flex: 1, minHeight: 0 }} />
      <div
        style={{
          padding: 12,
          background: "var(--brand-surface, #fff)",
          borderTop: "1px solid var(--brand-line, #e5e5e5)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {error && (
          <div
            data-testid="map-picker-error"
            style={{ fontSize: 13, color: "var(--brand-danger, #b53d3d)" }}
          >
            {error}
          </div>
        )}
        {resolving && (
          <div style={{ fontSize: 13, color: "var(--brand-sub, #888)" }}>Определяем адрес…</div>
        )}
        {picked && !resolving && (
          <div
            data-testid="map-picker-label"
            style={{ fontSize: 14, color: "var(--brand-text, #222)" }}
          >
            {picked.label}
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--brand-sub, #888)" }}>
          Тапните по карте, чтобы поставить точку
        </div>
        <button
          type="button"
          data-testid="map-picker-confirm"
          disabled={!picked || resolving}
          onClick={() => {
            if (!picked) return;
            onPick(picked.label, picked.coords);
            onClose();
          }}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            background:
              picked && !resolving ? "var(--brand-primary, #2d5a3d)" : "var(--brand-line, #ccc)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: picked && !resolving ? "pointer" : "not-allowed",
          }}
        >
          Подтвердить
        </button>
      </div>
    </div>
  );
}
