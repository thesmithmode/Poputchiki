import { useState } from "react";
import type { PassengerCoords } from "../hooks/useRides";
import { useSavedAddresses } from "../hooks/useSavedAddresses";
import { AddressAutocomplete, type Coords } from "./AddressAutocomplete";

interface Props {
  onSearch: (coords: PassengerCoords | null) => void;
}

export function PassengerSearchBar({ onSearch }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [fromLabel, setFromLabel] = useState("");
  const [fromCoords, setFromCoords] = useState<Coords | null>(null);
  const [toLabel, setToLabel] = useState("");
  const [toCoords, setToCoords] = useState<Coords | null>(null);
  const { addresses: savedAddresses } = useSavedAddresses();

  function handleFromChange(value: string, coords?: Coords) {
    setFromLabel(value);
    setFromCoords(coords ?? null);
    if (coords && toCoords) {
      onSearch({
        fromLat: coords.lat,
        fromLng: coords.lng,
        toLat: toCoords.lat,
        toLng: toCoords.lng,
      });
    }
  }

  function handleToChange(value: string, coords?: Coords) {
    setToLabel(value);
    setToCoords(coords ?? null);
    if (fromCoords && coords) {
      onSearch({
        fromLat: fromCoords.lat,
        fromLng: fromCoords.lng,
        toLat: coords.lat,
        toLng: coords.lng,
      });
    }
  }

  function handleClear() {
    setFromLabel("");
    setFromCoords(null);
    setToLabel("");
    setToCoords(null);
    setExpanded(false);
    onSearch(null);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        style={{
          width: "100%",
          padding: "10px 16px",
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
          borderRadius: 12,
          fontSize: 14,
          color: "var(--brand-text-secondary)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        Найти попутку по маршруту
      </button>
    );
  }

  return (
    <div
      style={{
        background: "var(--brand-surface)",
        borderRadius: 14,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: "1px solid var(--brand-border)",
      }}
    >
      <AddressAutocomplete
        value={fromLabel}
        onChange={handleFromChange}
        placeholder="Откуда"
        testId="passenger-from"
        savedAddresses={savedAddresses}
        showMyLocation
      />
      <AddressAutocomplete
        value={toLabel}
        onChange={handleToChange}
        placeholder="Куда"
        testId="passenger-to"
        savedAddresses={savedAddresses}
      />
      {(fromCoords || toCoords || fromLabel || toLabel) && (
        <button
          type="button"
          onClick={handleClear}
          style={{
            alignSelf: "flex-end",
            fontSize: 13,
            color: "var(--brand-text-secondary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
          }}
        >
          Очистить
        </button>
      )}
    </div>
  );
}
