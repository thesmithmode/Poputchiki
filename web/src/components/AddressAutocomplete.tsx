import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

export interface Coords {
  lat: number;
  lng: number;
}

export interface AddressSuggestion {
  label: string;
  source: "preset" | "geocode";
  coords?: Coords;
}

interface NominatimResult {
  display_name?: string;
  lat: string;
  lon: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string, coords?: Coords) => void;
  placeholder?: string;
  testId?: string;
  inputStyle?: React.CSSProperties;
}

// Label-only пресеты: координаты резолвятся geocoder'ом на submit или приходят из geocode-suggest.
// Выдумывать lat/lng запрещено (advisor #2): неверная точка ЖК уведёт людей в поле.
const PRESETS: readonly string[] = [
  "ЖК Царёво, Усады, Татарстан",
  "Дом 1, ЖК Царёво",
  "Дом 5, ЖК Царёво",
  "Дом 10, ЖК Царёво",
  "Дом 15, ЖК Царёво",
  "Дом 20, ЖК Царёво",
  "ТЦ Кольцо, Казань",
  "ТЦ МЕГА, Казань",
  "Аэропорт Казань",
  "Ж/д вокзал Казань-1",
  "Казанский Кремль",
  "КФУ, Кремлёвская 18, Казань",
  "Парк Победы, Казань",
  "Парк Горького, Казань",
  "Аквапарк Ривьера, Казань",
  "ИТ-парк, Казань",
  "Центральный стадион, Казань",
  "Иннополис",
];

function matchPresets(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return PRESETS.slice(0, 5);
  return PRESETS.filter((p) => p.toLowerCase().includes(q)).slice(0, 5);
}

const MIN_GEOCODE_CHARS = 3;
const DEBOUNCE_MS = 800;

export function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  testId,
  inputStyle,
}: AddressAutocompleteProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [geoSuggestions, setGeoSuggestions] = useState<AddressSuggestion[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const presets: AddressSuggestion[] = matchPresets(value).map((p) => ({
    label: p,
    source: "preset",
  }));

  const fetchGeoSuggestions = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_GEOCODE_CHARS) {
      setGeoSuggestions([]);
      return;
    }
    try {
      const q = /казань|татарстан/i.test(trimmed) ? trimmed : `${trimmed}, Казань`;
      const results = await apiFetch<NominatimResult[]>(
        `/geocode/search?q=${encodeURIComponent(q)}`,
      );
      if (!Array.isArray(results)) {
        setGeoSuggestions([]);
        return;
      }
      const mapped: AddressSuggestion[] = results.slice(0, 5).flatMap((r) => {
        const lat = Number.parseFloat(r.lat);
        const lng = Number.parseFloat(r.lon);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return [];
        return [
          {
            label: r.display_name?.split(",").slice(0, 3).join(",").trim() || trimmed,
            source: "geocode" as const,
            coords: { lat, lng },
          },
        ];
      });
      setGeoSuggestions(mapped);
    } catch {
      // Сетевой сбой / 429 / 503 — тихо проглатываем, остаются пресеты.
      setGeoSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (!value) {
      setGeoSuggestions([]);
      return;
    }
    const timer = setTimeout(() => fetchGeoSuggestions(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, fetchGeoSuggestions]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const suggestions: AddressSuggestion[] = [...presets, ...geoSuggestions];

  function pick(s: AddressSuggestion) {
    onChange(s.label, s.coords);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        data-testid={testId}
        value={value}
        onChange={(e) => {
          onChange(e.target.value, undefined);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        aria-expanded={open}
        aria-autocomplete="list"
        style={inputStyle}
      />
      {open && suggestions.length > 0 && (
        <div
          data-testid={testId ? `${testId}-listbox` : undefined}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            margin: "4px 0 0",
            padding: 0,
            background: "var(--brand-surface)",
            border: "1px solid var(--brand-line)",
            borderRadius: 8,
            boxShadow: "var(--shadow-md)",
            maxHeight: 260,
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {suggestions.map((s, idx) => (
            <button
              key={`${s.source}-${idx}-${s.label}`}
              type="button"
              data-testid={testId ? `${testId}-option-${idx}` : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: "var(--brand-text)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize: 12,
                  color: "var(--brand-sub)",
                  minWidth: 16,
                }}
              >
                {s.source === "preset" ? "★" : "○"}
              </span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
