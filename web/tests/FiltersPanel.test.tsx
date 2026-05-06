import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FiltersPanel } from "../src/components/FiltersPanel";
import { DEFAULT_FILTERS } from "../src/hooks/useFilters";

describe("FiltersPanel", () => {
  it("рендерится с дефолтными фильтрами", () => {
    render(
      <FiltersPanel filters={DEFAULT_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />,
    );
    expect(screen.getByTestId("filters-panel")).toBeInTheDocument();
    expect(screen.getByTestId("filter-direction")).toBeInTheDocument();
    expect(screen.getByTestId("filter-price-max")).toBeInTheDocument();
    expect(screen.getByTestId("filter-seats-min")).toBeInTheDocument();
    expect(screen.getByTestId("filter-verified")).toBeInTheDocument();
    expect(screen.getByTestId("filter-favorites")).toBeInTheDocument();
  });

  it("кнопка сброса скрыта при дефолтных фильтрах", () => {
    render(
      <FiltersPanel filters={DEFAULT_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />,
    );
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
    render(
      <FiltersPanel filters={DEFAULT_FILTERS} onChange={onChange} onReset={vi.fn()} />,
    );
    fireEvent.change(screen.getByTestId("filter-direction"), { target: { value: "Царёво" } });
    expect(onChange).toHaveBeenCalledWith({ direction: "Царёво" });
  });

  it("onChange вызывается при изменении seatsMin", () => {
    const onChange = vi.fn();
    render(
      <FiltersPanel filters={DEFAULT_FILTERS} onChange={onChange} onReset={vi.fn()} />,
    );
    fireEvent.change(screen.getByTestId("filter-seats-min"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith({ seatsMin: 3 });
  });

  it("onChange вызывается при переключении verifiedOnly", () => {
    const onChange = vi.fn();
    render(
      <FiltersPanel filters={DEFAULT_FILTERS} onChange={onChange} onReset={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("filter-verified"));
    expect(onChange).toHaveBeenCalledWith({ verifiedOnly: true });
  });

  it("onChange вызывается при переключении favoritesOnly", () => {
    const onChange = vi.fn();
    render(
      <FiltersPanel filters={DEFAULT_FILTERS} onChange={onChange} onReset={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("filter-favorites"));
    expect(onChange).toHaveBeenCalledWith({ favoritesOnly: true });
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
