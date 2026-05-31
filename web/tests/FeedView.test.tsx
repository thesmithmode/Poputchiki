import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeContext } from "../src/contexts/MeContext";
import { DEFAULT_FILTERS } from "../src/hooks/useFilters";
import type { MeState } from "../src/hooks/useMe";
import type { Ride } from "../src/types/ride";
import { FeedView } from "../src/views/FeedView";

vi.mock("../src/hooks/useRealtime", () => ({ useRealtime: vi.fn() }));

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

const ME_STATE: MeState = {
  status: "ok",
  user: {
    id: "current-user",
    display_name: "Test User",
    onboarded: true,
    is_banned: false,
    ban_reason: null,
    banned_at: null,
    role: "user",
  },
};

function makeRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: crypto.randomUUID(),
    driver_id: crypto.randomUUID(),
    from_label: "group-hit",
    from_lat: 55.7558,
    from_lng: 37.6173,
    to_label: "destination",
    to_lat: 55.7963,
    to_lng: 49.1093,
    departure_at: new Date(Date.now() + 3_600_000).toISOString(),
    price_rub: 150,
    seats_total: 3,
    seats_taken: 1,
    status: "active",
    comment: null,
    created_at: new Date().toISOString(),
    driver_display_name: "Driver",
    driver_avg_stars: null,
    driver_reviews_count: 0,
    ...overrides,
  };
}

function renderGroupedFeed(rides: Ride[], rideIds: string[]) {
  mockedApiFetch.mockImplementation(async (path) => {
    const url = String(path);
    if (url.startsWith("/ride-requests/mine")) return { requests: [] };
    if (url.startsWith("/rides?")) return { rides, nextCursor: null };
    throw new Error(`Unexpected apiFetch call: ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/", state: { mapRideGroup: { rideIds } } }]}>
      <QueryClientProvider client={client}>
        <MeContext.Provider value={ME_STATE}>
          <FeedView filters={DEFAULT_FILTERS} density="cozy" />
        </MeContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("FeedView map group filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("REGRESSION: route state from map group shows only rides from that group", async () => {
    const hit = makeRide({ id: "ride-in-group", from_label: "group-hit" });
    const miss = makeRide({ id: "ride-outside-group", from_label: "outside" });

    renderGroupedFeed([hit, miss], [hit.id]);

    await waitFor(() => {
      expect(screen.getByText("group-hit")).toBeInTheDocument();
    });
    expect(screen.queryByText("outside")).not.toBeInTheDocument();
  });

  it("does not render quick destination chips or a second result count inside the feed", async () => {
    renderGroupedFeed([makeRide({ from_label: "group-hit" })], []);

    await waitFor(() => {
      expect(screen.getByText("group-hit")).toBeInTheDocument();
    });
    expect(screen.queryByText("ул. Баумана")).not.toBeInTheDocument();
    expect(screen.queryByText(/Найдено/i)).not.toBeInTheDocument();
  });

  it("groups expanded feed cards by departure day", async () => {
    const today = new Date();
    today.setHours(today.getHours() + 1, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    renderGroupedFeed(
      [
        makeRide({ from_label: "today-start", departure_at: today.toISOString() }),
        makeRide({ from_label: "tomorrow-start", departure_at: tomorrow.toISOString() }),
      ],
      [],
    );

    await waitFor(() => {
      expect(screen.getByText("today-start")).toBeInTheDocument();
    });
    expect(screen.getByText("tomorrow-start")).toBeInTheDocument();
    expect(screen.getByText(/^Сегодня,/)).toBeInTheDocument();
    expect(screen.getByText(/^Завтра,/)).toBeInTheDocument();
  });
});
