import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FiltersPanel } from "../src/components/FiltersPanel";
import { DEFAULT_FILTERS } from "../src/hooks/useFilters";

vi.mock("../src/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({
    value,
    onChange,
    testId,
    savedAddresses,
    showMyLocation,
  }: {
    value: string;
    onChange: (v: string, c?: { lat: number; lng: number }) => void;
    testId?: string;
    savedAddresses?: unknown[];
    showMyLocation?: boolean;
  }) => (
    <input
      data-testid={testId}
      value={value}
      data-saved-count={savedAddresses?.length ?? 0}
      data-my-location={showMyLocation ? "true" : "false"}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

describe("FiltersPanel", () => {
  it("рендерится с дефолтными фильтрами", () => {
    render(<FiltersPanel filters={DEFAULT_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByTestId("filters-panel")).toBeInTheDocument();
    expect(screen.getByTestId("filter-from")).toBeInTheDocument();
    expect(screen.getByTestId("filter-direction")).toBeInTheDocument();
    expect(screen.getByTestId("filter-price-max")).toBeInTheDocument();
    expect(screen.getByTestId("filter-seats-min")).toBeInTheDocument();
    expect(screen.getByTestId("filter-verified")).toBeInTheDocument();
  });

  it("passes saved addresses to route address fields", () => {
    render(
      <FiltersPanel
        filters={DEFAULT_FILTERS}
        onChange={vi.fn()}
        onReset={vi.fn()}
        savedAddresses={[
          {
            id: "addr-1",
            type: "home",
            name: "Home",
            address_label: "Tsarevo",
            lat: 55.8,
            lng: 49.2,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]}
      />,
    );

    expect(screen.getByTestId("filter-from")).toHaveAttribute("data-saved-count", "1");
    expect(screen.getByTestId("filter-direction")).toHaveAttribute("data-saved-count", "1");
    expect(screen.getByTestId("filter-from")).toHaveAttribute("data-my-location", "true");
  });

  it("кнопка сброса скрыта при дефолтных фильтрах", () => {
    render(<FiltersPanel filters={DEFAULT_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByTestId("filter-reset")).not.toBeInTheDocument();
  });

  it("кнопка сброса видна при активных фильтрах", () => {
    render(
      <FiltersPanel
        filters={{ ...DEFAULT_FILTERS, direction: "Центр" }}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByTestId("filter-reset")).toBeInTheDocument();
  });

  it("onChange вызывается при вводе в поле direction", () => {
    const onChange = vi.fn();
    render(<FiltersPanel filters={DEFAULT_FILTERS} onChange={onChange} onReset={vi.fn()} />);
    fireEvent.change(screen.getByTestId("filter-direction"), { target: { value: "Царёво" } });
    expect(onChange).toHaveBeenCalledWith({ direction: "Царёво" });
  });

  it("onChange вызывается при изменении seatsMin", () => {
    const onChange = vi.fn();
    render(<FiltersPanel filters={DEFAULT_FILTERS} onChange={onChange} onReset={vi.fn()} />);
    fireEvent.change(screen.getByTestId("filter-seats-min"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith({ seatsMin: 3 });
  });

  it("empty seatsMin input resets seats filtering to any value", () => {
    const onChange = vi.fn();
    render(
      <FiltersPanel
        filters={{ ...DEFAULT_FILTERS, seatsMin: 3 }}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );
    const input = screen.getByTestId("filter-seats-min") as HTMLInputElement;
    expect(input.type).toBe("number");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ seatsMin: 0 });
  });

  it("onChange вызывается при переключении verifiedOnly", () => {
    const onChange = vi.fn();
    render(<FiltersPanel filters={DEFAULT_FILTERS} onChange={onChange} onReset={vi.fn()} />);
    fireEvent.click(screen.getByTestId("filter-verified"));
    expect(onChange).toHaveBeenCalledWith({ verifiedOnly: true });
  });

  it("onReset вызывается при клике на сброс", () => {
    const onReset = vi.fn();
    render(
      <FiltersPanel
        filters={{ ...DEFAULT_FILTERS, seatsMin: 3 }}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByTestId("filter-reset"));
    expect(onReset).toHaveBeenCalled();
  });
});
