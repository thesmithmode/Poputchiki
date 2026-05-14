import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BottomTabBar } from "../src/components/BottomTabBar";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderTabBar(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomTabBar />
    </MemoryRouter>,
  );
}

describe("BottomTabBar", () => {
  it("рендерится на главной странице /", () => {
    renderTabBar("/");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("рендерится на /map", () => {
    renderTabBar("/map");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("рендерится на /settings", () => {
    renderTabBar("/settings");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("рендерится на /settings/notifications", () => {
    renderTabBar("/settings/notifications");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("не рендерится на /rides/some-id", () => {
    const { container } = renderTabBar("/rides/550e8400-e29b-41d4-a716-446655440000");
    expect(container.querySelector("[role='navigation']")).not.toBeInTheDocument();
  });

  it("не рендерится на /rides/new", () => {
    const { container } = renderTabBar("/rides/new");
    expect(container.querySelector("[role='navigation']")).not.toBeInTheDocument();
  });

  it("не рендерится на /users/:id", () => {
    const { container } = renderTabBar("/users/123");
    expect(container.querySelector("[role='navigation']")).not.toBeInTheDocument();
  });

  it("не рендерится на /support", () => {
    const { container } = renderTabBar("/support");
    expect(container.querySelector("[role='navigation']")).not.toBeInTheDocument();
  });

  it("показывает кнопку 'Лента'", () => {
    renderTabBar("/");
    expect(screen.getByLabelText("Лента")).toBeInTheDocument();
  });

  it("показывает кнопку 'Карта'", () => {
    renderTabBar("/");
    expect(screen.getByLabelText("Карта")).toBeInTheDocument();
  });

  it("показывает FAB кнопку 'Создать поездку'", () => {
    renderTabBar("/");
    expect(screen.getByLabelText("Создать поездку")).toBeInTheDocument();
  });

  it("показывает кнопку 'События'", () => {
    renderTabBar("/");
    expect(screen.getByLabelText("События")).toBeInTheDocument();
  });

  it("показывает кнопку 'Я'", () => {
    renderTabBar("/");
    expect(screen.getByLabelText("Я")).toBeInTheDocument();
  });

  it("нажатие на 'Карта' вызывает navigate /map", () => {
    renderTabBar("/");
    fireEvent.click(screen.getByLabelText("Карта"));
    expect(mockNavigate).toHaveBeenCalledWith("/map");
  });

  it("нажатие на 'Лента' вызывает navigate /", () => {
    renderTabBar("/map");
    fireEvent.click(screen.getByLabelText("Лента"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("нажатие на FAB вызывает navigate /rides/new", () => {
    renderTabBar("/");
    fireEvent.click(screen.getByLabelText("Создать поездку"));
    expect(mockNavigate).toHaveBeenCalledWith("/rides/new");
  });

  it("нажатие на 'Я' вызывает navigate /settings", () => {
    renderTabBar("/");
    fireEvent.click(screen.getByLabelText("Я"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("нажатие на 'События' вызывает navigate /settings/notifications", () => {
    renderTabBar("/");
    fireEvent.click(screen.getByLabelText("События"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings/notifications");
  });

  it("рендерится на /favorites", () => {
    renderTabBar("/favorites");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});
