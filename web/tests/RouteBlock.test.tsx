import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteBlock } from "../src/components/RouteBlock";

describe("RouteBlock", () => {
  it("отображает fromLabel", () => {
    render(<RouteBlock fromLabel="ЖК Царёво, д. 5" toLabel="ул. Баумана" />);
    expect(screen.getByText("ЖК Царёво, д. 5")).toBeInTheDocument();
  });

  it("отображает toLabel", () => {
    render(<RouteBlock fromLabel="ЖК Царёво, д. 5" toLabel="ул. Баумана" />);
    expect(screen.getByText("ул. Баумана")).toBeInTheDocument();
  });

  it("рендерится в compact-режиме без ошибок", () => {
    const { container } = render(
      <RouteBlock fromLabel="Откуда" toLabel="Куда" compact />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("рендерится в dark-режиме без ошибок", () => {
    const { container } = render(
      <RouteBlock fromLabel="Откуда" toLabel="Куда" dark />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("принимает кастомные цвета", () => {
    const { container } = render(
      <RouteBlock
        fromLabel="A"
        toLabel="B"
        fromColor="#FF0000"
        toColor="#00FF00"
      />,
    );
    const dot = container.querySelector("span[style*='border-radius']");
    expect(dot).toBeInTheDocument();
  });

  it("рендерит иконку pin", () => {
    const { container } = render(<RouteBlock fromLabel="A" toLabel="B" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("оба лейбла не обрезаются в обычном режиме (не compact)", () => {
    render(<RouteBlock fromLabel="Длинное название откуда" toLabel="Длинное название куда" />);
    expect(screen.getByText("Длинное название откуда")).toBeInTheDocument();
    expect(screen.getByText("Длинное название куда")).toBeInTheDocument();
  });
});
