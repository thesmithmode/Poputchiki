import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SavedAddress } from "../hooks/useSavedAddresses";
import { byTsarevoFirst } from "../lib/addressBoost";
import { apiFetch } from "../lib/api";
import { fuzzyMatchSaved } from "../lib/fuzzyMatch";
import { getMatchingPresets } from "../lib/tsarevoPresets";

export interface Coords {
  lat: number;
  lng: number;
}

export interface AddressSuggestion {
  label: string;
  source: "geocode" | "preset" | "saved";
  coords: Coords;
  fullDisplay?: string;
  savedName?: string;
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
  savedAddresses?: SavedAddress[];
}

const MIN_GEOCODE_CHARS = 3;
const DEBOUNCE_MS = 350;
const MAX_SUGGESTIONS = 12;

function getSavedSuggestions(
  savedAddresses: SavedAddress[] | undefined,
  query: string,
): AddressSuggestion[] {
  if (!savedAddresses || savedAddresses.length === 0) return [];
  const trimmed = query.trim();
  const filtered =
    trimmed.length === 0
      ? savedAddresses
      : savedAddresses.filter((sa) => fuzzyMatchSaved(trimmed, sa.name));
  return filtered.map((sa) => ({
    label: sa.address_label,
    source: "saved" as const,
    coords: { lat: sa.lat, lng: sa.lng },
    savedName: sa.name,
  }));
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  testId,
  inputStyle,
  savedAddresses,
}: AddressAutocompleteProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [geoSuggestions, setGeoSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchGeoSuggestions = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_GEOCODE_CHARS) {
      // Меньше 3 символов — пресеты уже выставлены синхронно в useEffect ниже.
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await apiFetch<NominatimResult[]>(
        `/geocode/search?q=${encodeURIComponent(trimmed)}`,
      );
      const geo: AddressSuggestion[] = Array.isArray(results)
        ? results.slice(0, MAX_SUGGESTIONS).flatMap((r) => {
            const lat = Number.parseFloat(r.lat);
            const lng = Number.parseFloat(r.lon);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return [];
            const fullName = r.display_name ?? "";
            return [
              {
                label: fullName.split(",").slice(0, 4).join(",").trim() || trimmed,
                source: "geocode" as const,
                coords: { lat, lng },
                fullDisplay: fullName,
              },
            ];
          })
        : [];
      // Boost: царёво/шигалеево первыми среди geo. Дома, которых нет в захардкоженных
      // пресетах (напр. "Тукая 31"), реально находятся в ЖК Царёво — без буста
      // Nominatim может вернуть однофамильную улицу из другого района Татарстана.
      geo.sort(byTsarevoFirst);
      const presets = getMatchingPresets(trimmed);
      const combined = [...presets, ...geo].slice(0, MAX_SUGGESTIONS);
      setGeoSuggestions(combined);
    } catch {
      setGeoSuggestions(getMatchingPresets(trimmed));
    } finally {
      setLoading(false);
    }
  }, []);

  const savedSuggestions = useMemo(
    () => getSavedSuggestions(savedAddresses, value),
    [savedAddresses, value],
  );

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setGeoSuggestions([]);
      setLoading(false);
      return;
    }
    setGeoSuggestions(getMatchingPresets(trimmed));
    if (trimmed.length < MIN_GEOCODE_CHARS) {
      setLoading(false);
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

  function pick(s: AddressSuggestion) {
    onChange(s.label, s.coords);
    setOpen(false);
  }

  const allSuggestions = useMemo(() => {
    const deduped = geoSuggestions.filter(
      (g) =>
        !savedSuggestions.some(
          (s) =>
            Math.abs(s.coords.lat - g.coords.lat) < 0.0001 &&
            Math.abs(s.coords.lng - g.coords.lng) < 0.0001,
        ),
    );
    return [...savedSuggestions, ...deduped].slice(0, MAX_SUGGESTIONS);
  }, [savedSuggestions, geoSuggestions]);

  const showHint = false;
  const showLoading = open && loading && allSuggestions.length === 0;
  const showEmpty =
    open && !loading && allSuggestions.length === 0 && value.trim().length >= MIN_GEOCODE_CHARS;
  const showList = open && allSuggestions.length > 0;

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
      {(showList || showLoading || showEmpty || showHint) && (
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
            maxHeight: 320,
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {showHint && (
            <div
              data-testid={testId ? `${testId}-hint` : undefined}
              style={{
                padding: "10px 12px",
                fontSize: 13,
                color: "var(--brand-sub)",
              }}
            >
              Введите минимум {MIN_GEOCODE_CHARS} символа
            </div>
          )}
          {showLoading && (
            <div
              data-testid={testId ? `${testId}-loading` : undefined}
              style={{
                padding: "10px 12px",
                fontSize: 13,
                color: "var(--brand-sub)",
              }}
            >
              Поиск…
            </div>
          )}
          {showEmpty && (
            <div
              data-testid={testId ? `${testId}-empty` : undefined}
              style={{
                padding: "10px 12px",
                fontSize: 13,
                color: "var(--brand-sub)",
              }}
            >
              Ничего не найдено — уточните адрес
            </div>
          )}
          {showList &&
            allSuggestions.map((s, idx) => (
              <button
                key={`${idx}-${s.label}-${s.source}`}
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
                    fontSize: s.source === "saved" ? 14 : 12,
                    color: s.source === "saved" ? "#d4a017" : "var(--brand-sub)",
                    minWidth: 16,
                  }}
                >
                  {s.source === "saved" ? "★" : "○"}
                </span>
                <span>
                  {s.source === "saved" && s.savedName ? (
                    <>
                      <strong>{s.savedName}</strong>
                      <span style={{ color: "var(--brand-sub)", fontSize: 12, marginLeft: 4 }}>
                        {s.label}
                      </span>
                    </>
                  ) : (
                    s.label
                  )}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
