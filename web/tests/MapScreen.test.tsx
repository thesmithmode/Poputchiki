import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as L from "leaflet";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapScreen } from "../src/screens/MapScreen";

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../src/lib/telegram", () => ({ getTelegramWebApp: () => undefined }));

vi.mock("../src/hooks/useMe", () => ({
  useMe: vi.fn(() => ({
    status: "ok",
    user: {
      id: "user-1",
      display_name: "User",
      onboarded: true,
      is_banned: false,
      ban_reason: null,
      banned_at: null,
      role: "user",
    },
  })),
}));

vi.mock("../src/hooks/useMyRideRequests", () => ({
  useMyRideRequests: vi.fn(() => new Map()),
}));

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

// Mock Leaflet — jsdom has no canvas
vi.mock("leaflet", () => {
  const mockMap = {
    getBounds: vi.fn(() => ({
      getCenter: () => ({ lat: 55.76, lng: 49.1, distanceTo: () => 5000 }),
      getNorthEast: () => ({ lat: 55.9, lng: 49.3 }),
      getSouthWest: () => ({ lat: 55.6, lng: 49.0 }),
    })),
    on: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    distanceTo: vi.fn(() => 5000),
  };
  const mockMarker = {
    on: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
  };
  const mockPolyline = {
    addTo: vi.fn().mockReturnThis(),
  };
  const mockTileLayer = {
    addTo: vi.fn().mockReturnThis(),
  };
  const mockCircleMarker = {
    addTo: vi.fn().mockReturnThis(),
  };
  return {
    default: {
      map: vi.fn(() => mockMap),
      marker: vi.fn(() => mockMarker),
      polyline: vi.fn(() => mockPolyline),
      tileLayer: vi.fn(() => mockTileLayer),
      circleMarker: vi.fn(() => mockCircleMarker),
      divIcon: vi.fn((options) => options),
      latLngBounds: vi.fn((points) => ({ points })),
    },
    map: vi.fn(() => mockMap),
    marker: vi.fn(() => mockMarker),
    polyline: vi.fn(() => mockPolyline),
    tileLayer: vi.fn(() => mockTileLayer),
    circleMarker: vi.fn(() => mockCircleMarker),
    divIcon: vi.fn((options) => options),
    latLngBounds: vi.fn((points) => ({ points })),
  };
});

vi.mock("leaflet.markercluster", () => ({
  default: {},
  MarkerClusterGroup: vi.fn(() => ({
    addLayer: vi.fn(),
  })),
}));

import { useMyRideRequests } from "../src/hooks/useMyRideRequests";
import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseMyRideRequests = vi.mocked(useMyRideRequests);

const MOCK_RIDES = [
  {
    id: "ride-1",
    driver_id: "driver-1",
    from_label: "ЖК Царёво",
    from_lat: 55.75,
    from_lng: 37.61,
    to_label: "ул. Баумана",
    to_lat: 55.8,
    to_lng: 37.65,
    departure_at: new Date(Date.now() + 3600000).toISOString(),
    price_rub: 150,
    seats_total: 3,
    seats_taken: 1,
    status: "active",
    comment: null,
    template_id: null,
    created_at: new Date().toISOString(),
    route_duration_s: 35 * 60,
  },
];

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MapScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("MapScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockedApiFetch.mockReset();
    mockedUseMyRideRequests.mockReset();
    mockedUseMyRideRequests.mockReturnValue(new Map());
  });

  it("рендерит контейнер карты", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByTestId("map-screen")).toBeInTheDocument();
    expect(screen.getByTestId("leaflet-container")).toBeInTheDocument();
  });

  it("показывает loading пока грузятся данные", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByTestId("map-loading")).toBeInTheDocument();
  });

  it("вызывает onRidesCount с количеством поездок", async () => {
    const onRidesCount = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockedApiFetch.mockResolvedValueOnce({ rides: MOCK_RIDES });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <MapScreen onRidesCount={onRidesCount} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(onRidesCount).toHaveBeenCalledWith(1);
    });
  });

  it("показывает кнопки zoom и locate", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByTestId("zoom-in")).toBeInTheDocument();
    expect(screen.getByTestId("zoom-out")).toBeInTheDocument();
    expect(screen.getByTestId("locate-me")).toBeInTheDocument();
  });

  it("нет карточки поездки по умолчанию", async () => {
    mockedApiFetch.mockResolvedValueOnce({ rides: MOCK_RIDES });
    renderScreen();
    await waitFor(() => {
      expect(screen.queryByTestId("selected-ride-card")).not.toBeInTheDocument();
    });
  });

  it("вызывает onRidesCount(0) при пустом ответе", async () => {
    const onRidesCount = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockedApiFetch.mockResolvedValueOnce({ rides: [] });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <MapScreen onRidesCount={onRidesCount} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(onRidesCount).toHaveBeenCalledWith(0);
    });
  });

  it("вызывает apiFetch с fromLat и fromLng", async () => {
    mockedApiFetch.mockResolvedValueOnce({ rides: [] });
    renderScreen();
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(expect.stringContaining("/rides?fromLat="));
    });
  });

  it("кнопка locate-me отображается и кликабельна", async () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const mockGeolocation = {
      getCurrentPosition: vi.fn((_success, error) => error(new Error("denied"))),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });
    renderScreen();
    // wait for Leaflet init: loading disappears after 80ms timeout → mapRef.current is set
    await waitFor(() => expect(screen.queryByTestId("map-loading")).not.toBeInTheDocument(), {
      timeout: 2000,
    });
    const btn = screen.getByTestId("locate-me");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    await waitFor(() => expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled());
  });

  it("paints marker-card with feed state color for pending request", async () => {
    mockedUseMyRideRequests.mockReturnValue(new Map([["ride-1", "pending"]]));
    mockedApiFetch.mockResolvedValueOnce({ rides: MOCK_RIDES });

    renderScreen();

    await waitFor(() => {
      expect(L.divIcon).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining("background:var(--ride-applied-soft)"),
        }),
      );
    });
  });

  it("draws selected ride route after marker click", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({ rides: MOCK_RIDES })
      .mockResolvedValueOnce({ ...MOCK_RIDES[0], route_polyline: "mfp_I__vpAYBO@K@" });

    renderScreen();

    await waitFor(() => expect(L.marker).toHaveBeenCalled());
    const marker = vi.mocked(L.marker).mock.results[0]?.value as
      | { on: ReturnType<typeof vi.fn> }
      | undefined;
    const clickHandler = marker?.on.mock.calls.find(([event]) => event === "click")?.[1] as
      | (() => void)
      | undefined;
    expect(clickHandler).toBeDefined();

    await act(async () => {
      clickHandler?.();
    });

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/rides/ride-1");
      expect(L.polyline).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ weight: 4, opacity: 0.85 }),
      );
      const map = vi.mocked(L.map).mock.results[0]?.value as {
        fitBounds: ReturnType<typeof vi.fn>;
      };
      expect(map.fitBounds).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ paddingBottomRight: expect.any(Array) }),
      );
    });
  });

  it("hides other ride markers while a selected route is open", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({ rides: MOCK_RIDES })
      .mockResolvedValueOnce({ ...MOCK_RIDES[0], route_polyline: "mfp_I__vpAYBO@K@" });

    renderScreen();

    await waitFor(() => expect(L.marker).toHaveBeenCalled());
    const map = vi.mocked(L.map).mock.results[0]?.value as
      | { removeLayer: ReturnType<typeof vi.fn> }
      | undefined;
    const marker = vi.mocked(L.marker).mock.results[0]?.value as
      | { on: ReturnType<typeof vi.fn> }
      | undefined;
    const clickHandler = marker?.on.mock.calls.find(([event]) => event === "click")?.[1] as
      | (() => void)
      | undefined;

    await act(async () => {
      clickHandler?.();
    });

    await waitFor(() => {
      expect(map?.removeLayer).toHaveBeenCalledWith(marker);
    });
  });

  it("does not reload rides on map zoom while selected route is open", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({ rides: MOCK_RIDES })
      .mockResolvedValueOnce({ ...MOCK_RIDES[0], route_polyline: "mfp_I__vpAYBO@K@" });

    renderScreen();

    await waitFor(() => expect(L.marker).toHaveBeenCalled());
    const map = vi.mocked(L.map).mock.results[0]?.value as
      | { on: ReturnType<typeof vi.fn> }
      | undefined;
    const marker = vi.mocked(L.marker).mock.results[0]?.value as
      | { on: ReturnType<typeof vi.fn> }
      | undefined;
    const markerClick = marker?.on.mock.calls.find(([event]) => event === "click")?.[1] as
      | (() => void)
      | undefined;

    await act(async () => {
      markerClick?.();
    });
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledWith("/rides/ride-1"));
    mockedApiFetch.mockClear();

    const moveEndHandler = map?.on.mock.calls.find(([event]) => event === "moveend")?.[1] as
      | (() => void)
      | undefined;
    moveEndHandler?.();

    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("REGRESSION: collapses overlapping regular rides into a group marker and opens grouped feed", async () => {
    const groupedRides = Array.from({ length: 5 }, (_, i) => ({
      ...MOCK_RIDES[0],
      id: `ride-group-${i + 1}`,
      driver_id: i < 3 ? `driver-${i + 1}` : "driver-1",
      departure_at: new Date(Date.now() + (i + 1) * 3_600_000).toISOString(),
      from_lat: 55.75,
      from_lng: 37.61,
    }));
    mockedApiFetch.mockResolvedValueOnce({ rides: groupedRides });

    renderScreen();

    await waitFor(() => {
      expect(L.divIcon).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining("5 поездок"),
        }),
      );
    });

    const groupMarker = vi.mocked(L.marker).mock.results[0]?.value as
      | { on: ReturnType<typeof vi.fn> }
      | undefined;
    const clickHandler = groupMarker?.on.mock.calls.find(([event]) => event === "click")?.[1] as
      | (() => void)
      | undefined;
    expect(clickHandler).toBeDefined();

    await act(async () => {
      clickHandler?.();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({
        state: expect.objectContaining({
          mapRideGroup: expect.objectContaining({
            rideIds: groupedRides.map((ride) => ride.id),
          }),
        }),
      }),
    );
  });
});
