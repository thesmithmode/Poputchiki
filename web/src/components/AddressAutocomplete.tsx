import { useCallback, useEffect, useRef, useState } from "react";
import { byTsarevoFirst } from "../lib/addressBoost";
import { apiFetch } from "../lib/api";
import { getMatchingPresets } from "../lib/tsarevoPresets";

export interface Coords {
  lat: number;
  lng: number;
}

export interface AddressSuggestion {
  label: string;
  source: "geocode" | "preset";
  coords: Coords;
  // Полный display_name от Nominatim — используем для буста по совпадению с
  // "Царёво/Шигалеево" в полном адресе, label обрезан до 4 частей и совпадение там
  // не всегда видно. Для preset не заполняется.
  fullDisplay?: string;
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

const MIN_GEOCODE_CHARS = 3;
const DEBOUNCE_MS = 350;
const MAX_SUGGESTIONS = 12;

export function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  testId,
  inputStyle,
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

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      // Пустое поле — не показываем выпадашку. Пресеты появляются только когда юзер
      // начал вводить (см. ниже). Это убирает спам пресетов на focus пустого поля.
      setGeoSuggestions([]);
      setLoading(false);
      return;
    }
    // Пресеты показываем сразу (синхронно), не ждём debounce — это убирает 'empty' моргание.
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

  const showHint = false; // пресеты заменили hint
  const showLoading = open && loading && geoSuggestions.length === 0;
  const showEmpty =
    open && !loading && geoSuggestions.length === 0 && value.trim().length >= MIN_GEOCODE_CHARS;
  const showList = open && geoSuggestions.length > 0;

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
            geoSuggestions.map((s, idx) => (
              <button
                key={`${idx}-${s.label}`}
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
                  ○
                </span>
                <span>{s.label}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
