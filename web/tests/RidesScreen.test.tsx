import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeContext } from "../src/contexts/MeContext";
import type { MeState } from "../src/hooks/useMe";
import { RidesScreen } from "../src/screens/RidesScreen";

vi.mock("../src/lib/geolocation", () => ({ getCurrentLocation: vi.fn() }));
vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn().mockResolvedValue({ rides: [], nextCursor: null }) };
});
vi.mock("../src/hooks/useRealtime", () => ({ useRealtime: vi.fn() }));

import { getCurrentLocation } from "../src/lib/geolocation";

const mockedGetCurrentLocation = vi.mocked(getCurrentLocation);

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

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={client}>
        <MeContext.Provider value={ME_STATE}>
          <RidesScreen />
        </MeContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("RidesScreen location privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("does not request current location automatically when the feed opens", () => {
    renderScreen();

    expect(mockedGetCurrentLocation).not.toHaveBeenCalled();
  });
});
