import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComplaintSheet } from "../src/components/ComplaintSheet";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

const TARGET_USER_ID = "550e8400-e29b-41d4-a716-446655440010";
const TARGET_RIDE_ID = "550e8400-e29b-41d4-a716-446655440011";

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ComplaintSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("не рендерится когда open=false", () => {
    wrap(<ComplaintSheet open={false} targetUserId={TARGET_USER_ID} onClose={vi.fn()} />);
    expect(screen.queryByTestId("complaint-sheet")).not.toBeInTheDocument();
  });

  it("рендерится когда open=true", () => {
    wrap(<ComplaintSheet open={true} targetUserId={TARGET_USER_ID} onClose={vi.fn()} />);
    expect(screen.getByTestId("complaint-sheet")).toBeInTheDocument();
  });

  it("показывает 4 radio-кнопки reason_code", () => {
    wrap(<ComplaintSheet open={true} targetUserId={TARGET_USER_ID} onClose={vi.fn()} />);
    expect(screen.getByTestId("reason-spam")).toBeInTheDocument();
    expect(screen.getByTestId("reason-fraud")).toBeInTheDocument();
    expect(screen.getByTestId("reason-offense")).toBeInTheDocument();
    expect(screen.getByTestId("reason-other")).toBeInTheDocument();
  });

  it("textarea для доп. текста присутствует", () => {
    wrap(<ComplaintSheet open={true} targetUserId={TARGET_USER_ID} onClose={vi.fn()} />);
    expect(screen.getByTestId("complaint-text")).toBeInTheDocument();
  });

  it("textarea ограничена 1000 символами (maxLength)", () => {
    wrap(<ComplaintSheet open={true} targetUserId={TARGET_USER_ID} onClose={vi.fn()} />);
    const ta = screen.getByTestId("complaint-text") as HTMLTextAreaElement;
    expect(ta.maxLength).toBe(1000);
  });

  it("кнопка отправки задизейблена пока не выбрана причина", () => {
    wrap(<ComplaintSheet open={true} targetUserId={TARGET_USER_ID} onClose={vi.fn()} />);
    expect(screen.getByTestId("complaint-submit")).toBeDisabled();
  });

  it("кнопка активна после выбора причины", () => {
    wrap(<ComplaintSheet open={true} targetUserId={TARGET_USER_ID} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("reason-spam"));
    expect(screen.getByTestId("complaint-submit")).not.toBeDisabled();
  });

  it("submit вызывает POST /api/complaints с правильным телом", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "x", status: "open" });
    const onClose = vi.fn();
    wrap(<ComplaintSheet open={true} targetUserId={TARGET_USER_ID} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("reason-fraud"));
    fireEvent.change(screen.getByTestId("complaint-text"), { target: { value: "детали" } });
    fireEvent.click(screen.getByTestId("complaint-submit"));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/complaints",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"reason_code":"fraud"'),
        }),
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("submit с rideId включает target_ride_id в запрос", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "x", status: "open" });
    wrap(
      <ComplaintSheet
        open={true}
        targetUserId={TARGET_USER_ID}
        targetRideId={TARGET_RIDE_ID}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("reason-other"));
    fireEvent.click(screen.getByTestId("complaint-submit"));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/complaints",
        expect.objectContaining({
          body: expect.stringContaining(TARGET_RIDE_ID),
        }),
      );
    });
  });

  it("кнопка закрыть вызывает onClose", () => {
    const onClose = vi.fn();
    wrap(<ComplaintSheet open={true} targetUserId={TARGET_USER_ID} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("complaint-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
