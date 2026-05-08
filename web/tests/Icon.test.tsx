import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, type IconName } from "../src/components/Icon";

describe("Icon", () => {
  const KNOWN_NAMES: IconName[] = [
    "home",
    "map",
    "plus",
    "bell",
    "user",
    "search",
    "filter",
    "star",
    "star-fill",
    "heart",
    "heart-fill",
    "thumb",
    "thumb-fill",
    "chevron-r",
    "chevron-l",
    "chevron-d",
    "chevron-u",
    "x",
    "check",
    "pin",
    "circle",
    "circle-fill",
    "clock",
    "repeat",
    "tg",
    "shield",
    "flag",
    "message",
    "wallet",
    "arrow-r",
    "send",
    "sliders",
    "minus",
    "edit",
    "support",
    "logo",
    "swap",
    "radius",
    "metro",
    "shop",
    "plane",
    "edu",
    "briefcase",
    "layers",
  ];

  it.each(KNOWN_NAMES)("рендерит SVG для иконки '%s'", (name) => {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("возвращает null для неизвестного имени", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(<Icon name={"nonexistent-icon-xyz" as any} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("применяет переданный размер к SVG", () => {
    const { container } = render(<Icon name="home" size={32} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
  });

  it("применяет strokeWidth к SVG", () => {
    const { container } = render(<Icon name="home" stroke={2.5} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("stroke-width", "2.5");
  });

  it("применяет style к SVG", () => {
    const { container } = render(<Icon name="home" style={{ color: "rgb(255, 0, 0)" }} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveStyle({ color: "rgb(255, 0, 0)" });
  });

  it("дефолтный размер 22", () => {
    const { container } = render(<Icon name="home" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "22");
  });

  it("circle-fill имеет fill=currentColor и stroke=none", () => {
    const { container } = render(<Icon name="circle-fill" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("fill", "currentColor");
    expect(svg).toHaveAttribute("stroke", "none");
  });

  it("logo рендерит SVG с правильным viewBox", () => {
    const { container } = render(<Icon name="logo" size={24} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });
});
