import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRides } from "../src/hooks/useRides";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useRides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiFetch.mockResolvedValue({ rides: [], nextCursor: null });
  });

  it("passes nearby-from location and radius to GET /rides", async () => {
    renderHook(
      () =>
        useRides("24h", null, null, {
          fromLat: 55.8,
          fromLng: 49.2,
          radiusKm: 2,
        }),
      { wrapper },
    );

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    const path = String(mockedApiFetch.mock.calls[0]?.[0]);
    expect(path).toContain("fromLat=55.8");
    expect(path).toContain("fromLng=49.2");
    expect(path).toContain("radiusKm=2");
  });
});
