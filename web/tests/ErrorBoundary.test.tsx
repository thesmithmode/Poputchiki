import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { Empty } from "../src/components/ui/Empty";
import { ErrorView } from "../src/components/ui/ErrorView";
import { Loading } from "../src/components/ui/Loading";
import { Skeleton } from "../src/components/ui/Skeleton";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("test error");
  return <div>ok</div>;
}

describe("ErrorBoundary", () => {
  it("рендерит children при отсутствии ошибки", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("ловит ошибку и показывает fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("Loading", () => {
  it("рендерится без падения", () => {
    render(<Loading data-testid="loading" />);
    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });

  it("принимает кастомный текст", () => {
    render(<Loading text="Загрузка данных..." />);
    expect(screen.getByText("Загрузка данных...")).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("рендерит N строк", () => {
    render(<Skeleton lines={3} data-testid="skeleton" />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });
});

describe("Empty", () => {
  it("показывает текст", () => {
    render(<Empty text="Нет поездок" />);
    expect(screen.getByText("Нет поездок")).toBeInTheDocument();
  });

  it("рендерит data-testid", () => {
    render(<Empty text="Нет" data-testid="empty-state" />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });
});

describe("ErrorView", () => {
  it("показывает сообщение", () => {
    render(<ErrorView message="Ошибка сети" />);
    expect(screen.getByText("Ошибка сети")).toBeInTheDocument();
  });

  it("рендерит кнопку retry если передан onRetry", () => {
    render(<ErrorView message="Ошибка" onRetry={() => {}} />);
    expect(screen.getByTestId("retry-btn")).toBeInTheDocument();
  });

  it("не рендерит retry без onRetry", () => {
    render(<ErrorView message="Ошибка" />);
    expect(screen.queryByTestId("retry-btn")).not.toBeInTheDocument();
  });
});
