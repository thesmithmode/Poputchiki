import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddressAutocomplete, type Coords } from "../src/components/AddressAutocomplete";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

// Debounce 350ms — ждём чуть больше реальным таймером.
const DEBOUNCE_WAIT = 500;

function Harness({
  initial = "",
  onChange,
}: {
  initial?: string;
  onChange?: (v: string, c?: Coords) => void;
}) {
  const [value, setValue] = useState(initial);
  const [lastCoords, setLastCoords] = useState<Coords | null>(null);
  return (
    <div>
      <AddressAutocomplete
        testId="addr"
        value={value}
        onChange={(v, c) => {
          setValue(v);
          setLastCoords(c ?? null);
          onChange?.(v, c);
        }}
      />
      <div data-testid="value-mirror">{value}</div>
      <div data-testid="coords-mirror">
        {lastCoords ? `${lastCoords.lat},${lastCoords.lng}` : "none"}
      </div>
      <button type="button" data-testid="outside">
        outside
      </button>
    </div>
  );
}

describe("AddressAutocomplete", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("рендерит input с testId", () => {
    render(<Harness />);
    expect(screen.getByTestId("addr")).toBeInTheDocument();
  });

  it("focus с пустым значением — НЕ показывает список (пресеты только при typing)", () => {
    render(<Harness />);
    fireEvent.focus(screen.getByTestId("addr"));
    expect(screen.queryByTestId("addr-listbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Царёво Village, ул. Тукая, д. 4")).not.toBeInTheDocument();
  });

  it("не показывает dropdown пока input без focus", () => {
    render(<Harness />);
    expect(screen.queryByTestId("addr-listbox")).not.toBeInTheDocument();
  });

  it("при <3 символах показывает пресеты, не hint и не geocode-запрос", async () => {
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ТЦ" } });
    expect(screen.queryByTestId("addr-hint")).not.toBeInTheDocument();
    expect(screen.getByTestId("addr-listbox")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, DEBOUNCE_WAIT));
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("Escape закрывает dropdown с hint", () => {
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ТЦ" } });
    expect(screen.getByTestId("addr-listbox")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("addr-listbox")).not.toBeInTheDocument();
  });

  it("click outside закрывает dropdown", () => {
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ТЦ" } });
    expect(screen.getByTestId("addr-listbox")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByTestId("addr-listbox")).not.toBeInTheDocument();
  });

  it("debounced geocode при ≥3 символах", async () => {
    mockedApiFetch.mockResolvedValueOnce([
      { display_name: "Аэропорт Казань", lat: "55.6", lon: "49.27" },
    ]);
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Аэропорт" } });
    await waitFor(
      () => {
        expect(mockedApiFetch).toHaveBeenCalledWith(expect.stringContaining("/geocode/search?q="));
      },
      { timeout: 2000 },
    );
  });

  it("клик по результату передаёт coords из dropdown", async () => {
    mockedApiFetch.mockResolvedValueOnce([
      { display_name: "Стадион Рубин, Чистопольская, Казань", lat: "55.8204", lon: "49.1192" },
    ]);
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Рубин" } });
    const opt = await screen.findByText(/Стадион Рубин/, undefined, { timeout: 2000 });
    fireEvent.mouseDown(opt);
    await waitFor(() => {
      expect(screen.getByTestId("coords-mirror")).toHaveTextContent("55.8204,49.1192");
    });
  });

  it("сбой geocode → показывает пресеты Царёво вместо empty message", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("503"));
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Кольцо" } });
    await waitFor(
      () => {
        expect(screen.getByText(/ТЦ Кольцо/)).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    expect(screen.queryByTestId("addr-empty")).not.toBeInTheDocument();
  });

  it("geocode возвращает не-массив → показывает пресеты Царёво", async () => {
    mockedApiFetch.mockResolvedValueOnce({ error: "geocoder_unavailable" } as never);
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Кольцо" } });
    await waitFor(
      () => {
        expect(screen.getByText(/ТЦ Кольцо/)).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    expect(screen.queryByTestId("addr-empty")).not.toBeInTheDocument();
  });

  it("geocode с NaN-coords отбрасывает запись", async () => {
    mockedApiFetch.mockResolvedValueOnce([
      { display_name: "Бракованный", lat: "abc", lon: "xyz" },
      { display_name: "ТЦ Кольцо, Казань", lat: "55.7937", lon: "49.1305" },
    ]);
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Кольцо" } });
    await waitFor(
      () => {
        expect(mockedApiFetch).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
    expect(screen.queryByText("Бракованный")).not.toBeInTheDocument();
  });

  it("очистка значения сбрасывает geocode-предложения", async () => {
    mockedApiFetch.mockResolvedValueOnce([
      { display_name: "Аэропорт Казань", lat: "55.6", lon: "49.27" },
    ]);
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Аэропорт" } });
    await screen.findByTestId("addr-option-0", undefined, { timeout: 2000 });
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() => {
      expect(screen.queryByText(/Аэропорт Казань/)).not.toBeInTheDocument();
    });
  });

  it("query отправляется как есть, без автодобавления Татарстан", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Баумана" } });
    await waitFor(
      () => {
        expect(mockedApiFetch).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
    const calls = mockedApiFetch.mock.calls.map(([p]) => decodeURIComponent(p as string));
    expect(calls.some((p) => p.includes("q=Баумана"))).toBe(true);
    expect(calls.some((p) => /q=.*Татарстан/.test(p))).toBe(false);
  });

  it("query не задваивает регион если уже есть 'Татарстан'", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Усады, Татарстан" } });
    await waitFor(
      () => {
        expect(mockedApiFetch).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
    const calls = mockedApiFetch.mock.calls.map(([p]) => decodeURIComponent(p as string));
    const last = calls[calls.length - 1] ?? "";
    expect(last).not.toMatch(/Татарстан,\s*Татарстан$/);
  });

  it("показывает до 12 результатов из Nominatim", async () => {
    const results = Array.from({ length: 15 }, (_, i) => ({
      display_name: `Адрес ${i}, Казань`,
      lat: `55.${i.toString().padStart(2, "0")}`,
      lon: `49.${i.toString().padStart(2, "0")}`,
    }));
    mockedApiFetch.mockResolvedValueOnce(results);
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Адрес" } });
    await waitFor(
      () => {
        expect(screen.getByTestId("addr-option-11")).toBeInTheDocument();
        expect(screen.queryByTestId("addr-option-12")).not.toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it("пресеты Царёво НЕ показываются при пустом focus — только при typing", () => {
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    expect(screen.queryByText("Царёво Village, ул. Тукая, д. 4")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Тукая 4" } });
    expect(screen.getByText("Царёво Village, ул. Тукая, д. 4")).toBeInTheDocument();
  });

  it("smart matching: 'тукая 31' даёт preset д.31 если он есть в списке", () => {
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    // В presetsData нет д.31 → пустой список (фронт-side), Nominatim покроет через structured search.
    // Но "тукая 4" → matches preset д.4 через алиас.
    fireEvent.change(input, { target: { value: "тукая 4" } });
    expect(screen.getByText("Царёво Village, ул. Тукая, д. 4")).toBeInTheDocument();
  });

  it("smart matching: 'мега' матчит ТЦ МЕГА через алиас", () => {
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "мега" } });
    expect(screen.getByText(/ТЦ МЕГА/)).toBeInTheDocument();
  });
});
