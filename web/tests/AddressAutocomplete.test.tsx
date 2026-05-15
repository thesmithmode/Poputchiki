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

// Debounce компонента 800ms. В тестах ждём чуть больше реальным таймером —
// fake timers конфликтуют с waitFor (waitFor использует setInterval).
const DEBOUNCE_WAIT = 950;

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

  it("показывает пресеты при focus с пустым значением", () => {
    render(<Harness />);
    fireEvent.focus(screen.getByTestId("addr"));
    expect(screen.getByTestId("addr-listbox")).toBeInTheDocument();
    expect(screen.getByText("ЖК Царёво, Усады, Татарстан")).toBeInTheDocument();
  });

  it("не показывает dropdown пока input без focus", () => {
    render(<Harness />);
    expect(screen.queryByTestId("addr-listbox")).not.toBeInTheDocument();
  });

  it("фильтрует пресеты по подстроке", () => {
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Кольцо" } });
    expect(screen.getByText("ТЦ Кольцо, Казань")).toBeInTheDocument();
    expect(screen.queryByText("ЖК Царёво, Усады, Татарстан")).not.toBeInTheDocument();
  });

  it("клик по пресету подставляет label без coords", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Кольцо" } });
    fireEvent.mouseDown(screen.getByText("ТЦ Кольцо, Казань"));
    expect(onChange).toHaveBeenLastCalledWith("ТЦ Кольцо, Казань", undefined);
    expect(screen.getByTestId("coords-mirror")).toHaveTextContent("none");
  });

  it("Escape закрывает dropdown", () => {
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    expect(screen.getByTestId("addr-listbox")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("addr-listbox")).not.toBeInTheDocument();
  });

  it("click outside закрывает dropdown", () => {
    render(<Harness />);
    fireEvent.focus(screen.getByTestId("addr"));
    expect(screen.getByTestId("addr-listbox")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByTestId("addr-listbox")).not.toBeInTheDocument();
  });

  it("не дёргает geocode при <3 символах", async () => {
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ТЦ" } });
    await new Promise((r) => setTimeout(r, DEBOUNCE_WAIT));
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("debounced geocode после 800ms с ≥3 символами", async () => {
    mockedApiFetch.mockResolvedValueOnce([
      { display_name: "Аэропорт Казань, ул Aero, Казань", lat: "55.6", lon: "49.27" },
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

  it("клик по geocode-результату передаёт coords", async () => {
    // Используем уникальное слово в display_name — иначе findByText матчит preset
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

  it("geocode сбой не падает, остаются пресеты", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("503"));
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Кольцо" } });
    await new Promise((r) => setTimeout(r, DEBOUNCE_WAIT));
    expect(screen.getByTestId("addr-listbox")).toBeInTheDocument();
    expect(screen.getByText("ТЦ Кольцо, Казань")).toBeInTheDocument();
  });

  it("geocode с не-массивом игнорируется", async () => {
    mockedApiFetch.mockResolvedValueOnce({ error: "geocoder_unavailable" } as never);
    render(<Harness />);
    const input = screen.getByTestId("addr");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Кольцо" } });
    await new Promise((r) => setTimeout(r, DEBOUNCE_WAIT));
    expect(screen.getByTestId("addr-listbox")).toBeInTheDocument();
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
    await screen.findByText(/Аэропорт Казань/, undefined, { timeout: 2000 });
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() => {
      expect(screen.queryByText(/Аэропорт Казань/)).not.toBeInTheDocument();
    });
  });

  it("query содержит 'Казань' если регион ещё не введён", async () => {
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
    expect(calls.some((p) => p.includes("Казань"))).toBe(true);
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
    // Запрос не содержит ", Казань" т.к. уже задан регион "Татарстан"
    expect(last).not.toMatch(/Татарстан,\s*Казань$/);
  });
});
