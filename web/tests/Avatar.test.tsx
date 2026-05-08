import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "../src/components/Avatar";

describe("Avatar", () => {
  it("рендерит img с photoUrl когда url задан", () => {
    render(<Avatar tgId={12345} photoUrl="https://example.com/photo.jpg" displayName="Иван" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    expect(img).toHaveAttribute("alt", "Иван");
  });

  it("показывает identicon когда photoUrl=null", () => {
    render(<Avatar tgId={12345} photoUrl={null} displayName="Иван" />);
    expect(screen.getByTestId("avatar-identicon")).toBeInTheDocument();
  });

  it("показывает identicon когда photoUrl не задан", () => {
    render(<Avatar tgId={12345} displayName="Иван" />);
    expect(screen.getByTestId("avatar-identicon")).toBeInTheDocument();
  });

  it("переключается на identicon при ошибке загрузки фото", () => {
    render(<Avatar tgId={12345} photoUrl="https://example.com/photo.jpg" displayName="Иван" />);
    const img = screen.getByRole("img");
    expect(img).not.toHaveAttribute("data-testid", "avatar-identicon");
    fireEvent.error(img);
    expect(screen.getByTestId("avatar-identicon")).toBeInTheDocument();
  });

  it("одинаковый tg_id даёт одинаковый identicon src", () => {
    const { rerender } = render(<Avatar tgId={99999} />);
    const src1 = screen.getByRole("img").getAttribute("src");
    rerender(<Avatar tgId={99999} />);
    const src2 = screen.getByRole("img").getAttribute("src");
    expect(src1).toBe(src2);
  });

  it("разные tg_id дают разные identicon src", () => {
    const { rerender } = render(<Avatar tgId={1} />);
    const src1 = screen.getByRole("img").getAttribute("src");
    rerender(<Avatar tgId={2} />);
    const src2 = screen.getByRole("img").getAttribute("src");
    expect(src1).not.toBe(src2);
  });

  it("identicon имеет alt=displayName", () => {
    render(<Avatar tgId={12345} displayName="Мария" />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Мария");
  });
});
