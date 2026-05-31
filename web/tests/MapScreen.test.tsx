import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as L from "leaflet";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramWebApp } from "../src/lib/telegram";
import { MapScreen } from "../src/screens/MapScreen";

const mockNavigate = vi.hoisted(() => vi.fn());
const telegramWebApp = vi.hoisted(() => ({ current: undefined as TelegramWebApp | undefined }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../src/lib/telegram", () => ({ getTelegramWebApp: () => telegramWebApp.current }));

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
    removeLayer: vi.fn((layer?: { getElement?: () => HTMLElement | null }) => {
      layer?.getElement?.()?.remove();
    }),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    getZoom: vi.fn(() => 15),
    dragging: {
      disable: vi.fn(),
      enable: vi.fn(),
    },
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    setView: vi.fn(),
    distanceTo: vi.fn(() => 5000),
  };
  const createMarker = (_coords?: unknown, options?: { icon?: { html?: string } }) => {
    const element = document.createElement("div");
    if (options?.icon?.html) element.innerHTML = options.icon.html;
    const marker: {
      on: ReturnType<typeof vi.fn>;
      addTo: ReturnType<typeof vi.fn>;
      getElement: ReturnType<typeof vi.fn>;
    } = {
      on: vi.fn().mockReturnThis(),
      addTo: vi.fn(),
      getElement: vi.fn(() => element),
    };
    marker.addTo.mockImplementation(() => {
      document.querySelector('[data-testid="leaflet-container"]')?.appendChild(element);
      return marker;
    });
    return marker;
  };
  const mockPolyline = {
    addTo: vi.fn().mockReturnThis(),
  };
  const mockTileLayer = {
    addTo: vi.fn().mockReturnThis(),
  };
  const mockCircle = {
    addTo: vi.fn().mockReturnThis(),
  };
  return {
    default: {
      map: vi.fn(() => mockMap),
      marker: vi.fn(createMarker),
      polyline: vi.fn(() => mockPolyline),
      tileLayer: vi.fn(() => mockTileLayer),
      circle: vi.fn(() => mockCircle),
      circleMarker: vi.fn(() => mockCircle),
      divIcon: vi.fn((options) => options),
      latLngBounds: vi.fn((points) => ({ points })),
    },
    map: vi.fn(() => mockMap),
    marker: vi.fn(createMarker),
    polyline: vi.fn(() => mockPolyline),
    tileLayer: vi.fn(() => mockTileLayer),
    circle: vi.fn(() => mockCircle),
    circleMarker: vi.fn(() => mockCircle),
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

class MockDeviceOrientationEvent extends Event {
  alpha: number | null;
  absolute: boolean;
  webkitCompassHeading?: number;

  constructor(
    type: string,
    init: { alpha?: number | null; absolute?: boolean; webkitCompassHeading?: number } = {},
  ) {
    super(type);
    this.alpha = init.alpha ?? null;
    this.absolute = init.absolute ?? false;
    if (init.webkitCompassHeading !== undefined) {
      this.webkitCompassHeading = init.webkitCompassHeading;
    }
  }
}

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
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    telegramWebApp.current = undefined;
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true });
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

  it("REGRESSION: locate draws the exact returned point and its accuracy radius", async () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 55.801,
            longitude: 49.123,
            accuracy: 42,
          },
        }),
      ),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    renderScreen();
    await waitFor(() => expect(screen.queryByTestId("map-loading")).not.toBeInTheDocument(), {
      timeout: 2000,
    });

    vi.mocked(L.marker).mockClear();
    vi.mocked(L.circle).mockClear();
    const map = vi.mocked(L.map).mock.results[0]?.value as
      | { setView: ReturnType<typeof vi.fn> }
      | undefined;

    fireEvent.click(screen.getByTestId("locate-me"));

    await waitFor(() => {
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
      expect(L.marker).toHaveBeenCalledWith(
        [55.801, 49.123],
        expect.objectContaining({ zIndexOffset: 10 }),
      );
      expect(L.circle).toHaveBeenCalledWith(
        [55.801, 49.123],
        expect.objectContaining({ radius: 42 }),
      );
      expect(map?.setView).toHaveBeenCalledWith([55.801, 49.123], 15, {
        animate: true,
        duration: 0.4,
      });
      expect(screen.getByTestId("leaflet-container").style.transform).not.toContain("rotate(");
    });
  });

  it("REGRESSION: second locate tap enables heading-up mode with arrow marker and rotated map", async () => {
    vi.stubGlobal("DeviceOrientationEvent", MockDeviceOrientationEvent);
    telegramWebApp.current = {
      colorScheme: "light",
      platform: "ios",
      onEvent: vi.fn(),
      ready: vi.fn(),
    };
    Object.defineProperty(window, "innerWidth", { value: 535, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 947, configurable: true });
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 55.801,
            longitude: 49.123,
            accuracy: 42,
          },
        }),
      ),
      watchPosition: vi.fn((success) => {
        success({
          coords: {
            latitude: 55.802,
            longitude: 49.124,
            accuracy: 24,
          },
        });
        return 77;
      }),
      clearWatch: vi.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    renderScreen();
    await waitFor(() => expect(screen.queryByTestId("map-loading")).not.toBeInTheDocument(), {
      timeout: 2000,
    });

    const btn = screen.getByTestId("locate-me");
    fireEvent.click(btn);
    await waitFor(() => expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled());
    window.dispatchEvent(
      new MockDeviceOrientationEvent("deviceorientation", { webkitCompassHeading: 90 }),
    );
    await waitFor(() =>
      expect(L.divIcon).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining("rotate(90deg)") }),
      ),
    );

    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("leaflet-container").style.transform).toContain("rotate(-90deg)");
      expect(screen.getByTestId("leaflet-viewport").style.transform).not.toContain("rotate(");
      expect(
        Number.parseFloat(screen.getByTestId("leaflet-container").style.width),
      ).toBeGreaterThan(Math.ceil(Math.hypot(535, 947)));
      expect(
        vi.mocked(L.divIcon).mock.calls.some(([options]) => {
          const html = (options as { html?: string } | undefined)?.html;
          return html?.includes("data-heading-arrow") ?? false;
        }),
      ).toBe(true);
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });
  });

  it("REGRESSION: desktop second locate tap recenters but never enables heading-up", async () => {
    vi.stubGlobal("DeviceOrientationEvent", MockDeviceOrientationEvent);
    telegramWebApp.current = {
      colorScheme: "light",
      platform: "tdesktop",
      onEvent: vi.fn(),
      ready: vi.fn(),
    };
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 55.801,
            longitude: 49.123,
            accuracy: 42,
          },
        }),
      ),
      watchPosition: vi.fn(() => 42),
      clearWatch: vi.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    renderScreen();
    await waitFor(() => expect(screen.queryByTestId("map-loading")).not.toBeInTheDocument(), {
      timeout: 2000,
    });

    const btn = screen.getByTestId("locate-me");
    fireEvent.click(btn);
    await waitFor(() => expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(1));
    window.dispatchEvent(
      new MockDeviceOrientationEvent("deviceorientation", { webkitCompassHeading: 90 }),
    );
    fireEvent.click(btn);

    await waitFor(() => expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(2));
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(mockGeolocation.watchPosition).not.toHaveBeenCalled();
    expect(screen.getByTestId("leaflet-container").style.transform).not.toContain("rotate(");
  });

  it("REGRESSION: heading-up renders compact upright ride markers and updates counter-rotation", async () => {
    vi.stubGlobal("DeviceOrientationEvent", MockDeviceOrientationEvent);
    telegramWebApp.current = {
      colorScheme: "light",
      platform: "ios",
      onEvent: vi.fn(),
      ready: vi.fn(),
    };
    mockedApiFetch.mockResolvedValueOnce({ rides: MOCK_RIDES });
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 55.801,
            longitude: 49.123,
            accuracy: 42,
          },
        }),
      ),
      watchPosition: vi.fn(() => 77),
      clearWatch: vi.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    renderScreen();
    await waitFor(() =>
      expect(
        vi.mocked(L.divIcon).mock.calls.some(([options]) => {
          const html = (options as { html?: string } | undefined)?.html;
          return html?.includes("data-ride-card-marker") ?? false;
        }),
      ).toBe(true),
    );

    const btn = screen.getByTestId("locate-me");
    fireEvent.click(btn);
    await waitFor(() => expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled());
    window.dispatchEvent(
      new MockDeviceOrientationEvent("deviceorientation", { webkitCompassHeading: 90 }),
    );
    fireEvent.click(btn);

    const stage = screen.getByTestId("leaflet-container");
    await waitFor(() => {
      const marker = stage.querySelector("[data-compact-ride-marker]") as HTMLElement | null;
      expect(marker).not.toBeNull();
      expect(marker?.dataset.mapUpright).toBe("true");
      expect(marker?.style.transform).toBe("rotate(90deg)");
    });

    window.dispatchEvent(
      new MockDeviceOrientationEvent("deviceorientation", { webkitCompassHeading: 180 }),
    );
    await waitFor(() => {
      const marker = stage.querySelector("[data-compact-ride-marker]") as HTMLElement | null;
      expect(marker?.style.transform).toBe("rotate(180deg)");
    });

    fireEvent.click(btn);
    await waitFor(() => {
      expect(stage.querySelector("[data-compact-ride-marker]")).toBeNull();
      expect(stage.querySelector("[data-ride-card-marker]")).not.toBeNull();
    });
  });

  it("REGRESSION: heading-up follows compass updates and stops browser watch on third tap", async () => {
    vi.stubGlobal("DeviceOrientationEvent", MockDeviceOrientationEvent);
    telegramWebApp.current = {
      colorScheme: "light",
      platform: "ios",
      onEvent: vi.fn(),
      ready: vi.fn(),
    };
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 55.801,
            longitude: 49.123,
            accuracy: 42,
          },
        }),
      ),
      watchPosition: vi.fn(() => 91),
      clearWatch: vi.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    renderScreen();
    await waitFor(() => expect(screen.queryByTestId("map-loading")).not.toBeInTheDocument(), {
      timeout: 2000,
    });

    const btn = screen.getByTestId("locate-me");
    fireEvent.click(btn);
    await waitFor(() => expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled());
    window.dispatchEvent(
      new MockDeviceOrientationEvent("deviceorientation", { webkitCompassHeading: 90 }),
    );
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute("aria-pressed", "true"));

    window.dispatchEvent(
      new MockDeviceOrientationEvent("deviceorientation", { webkitCompassHeading: 180 }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("leaflet-container").style.transform).toContain("rotate(-180deg)");
    });

    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(91);
      expect(btn).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTestId("leaflet-container").style.transform).toBe("rotate(0deg)");
    });
  });

  it("REGRESSION: second locate tap without real compass does not enable heading-up", async () => {
    vi.stubGlobal("DeviceOrientationEvent", MockDeviceOrientationEvent);
    telegramWebApp.current = {
      colorScheme: "light",
      platform: "ios",
      onEvent: vi.fn(),
      ready: vi.fn(),
    };
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 55.801,
            longitude: 49.123,
            accuracy: 42,
          },
        }),
      ),
      watchPosition: vi.fn(() => 42),
      clearWatch: vi.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    renderScreen();
    await waitFor(() => expect(screen.queryByTestId("map-loading")).not.toBeInTheDocument(), {
      timeout: 2000,
    });

    const btn = screen.getByTestId("locate-me");
    fireEvent.click(btn);
    await waitFor(() => expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled());
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText("Компас недоступен")).toBeInTheDocument());
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(mockGeolocation.watchPosition).not.toHaveBeenCalled();
    expect(screen.getByTestId("leaflet-container").style.transform).not.toContain("rotate(");
  });

  it("REGRESSION: locate keeps the dot but does not draw a compass cone without real heading", async () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 55.801,
            longitude: 49.123,
            accuracy: 42,
          },
        }),
      ),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    renderScreen();
    await waitFor(() => expect(screen.queryByTestId("map-loading")).not.toBeInTheDocument(), {
      timeout: 2000,
    });

    vi.mocked(L.marker).mockClear();
    fireEvent.click(screen.getByTestId("locate-me"));

    await waitFor(() => {
      expect(L.marker).toHaveBeenCalledWith(
        [55.801, 49.123],
        expect.objectContaining({ zIndexOffset: 10 }),
      );
    });
    expect(L.marker).not.toHaveBeenCalledWith(
      [55.801, 49.123],
      expect.objectContaining({ zIndexOffset: -10 }),
    );
  });

  it("REGRESSION: locate draws a compass cone after a real webkit compass heading", async () => {
    vi.stubGlobal("DeviceOrientationEvent", MockDeviceOrientationEvent);
    telegramWebApp.current = {
      colorScheme: "light",
      platform: "ios",
      onEvent: vi.fn(),
      ready: vi.fn(),
    };
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 55.801,
            longitude: 49.123,
            accuracy: 42,
          },
        }),
      ),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    renderScreen();
    await waitFor(() => expect(screen.queryByTestId("map-loading")).not.toBeInTheDocument(), {
      timeout: 2000,
    });

    vi.mocked(L.marker).mockClear();
    fireEvent.click(screen.getByTestId("locate-me"));
    await waitFor(() => {
      expect(L.marker).toHaveBeenCalledWith(
        [55.801, 49.123],
        expect.objectContaining({ zIndexOffset: 10 }),
      );
    });
    expect(L.marker).not.toHaveBeenCalledWith(
      [55.801, 49.123],
      expect.objectContaining({ zIndexOffset: -10 }),
    );

    window.dispatchEvent(
      new MockDeviceOrientationEvent("deviceorientation", { webkitCompassHeading: 90 }),
    );

    await waitFor(() => {
      expect(L.marker).toHaveBeenCalledWith(
        [55.801, 49.123],
        expect.objectContaining({ zIndexOffset: -10 }),
      );
      expect(L.divIcon).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining("rotate(90deg)"),
        }),
      );
    });
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

  it("REGRESSION: selecting a ride turns off heading-up before fitting the route", async () => {
    vi.stubGlobal("DeviceOrientationEvent", MockDeviceOrientationEvent);
    telegramWebApp.current = {
      colorScheme: "light",
      platform: "ios",
      onEvent: vi.fn(),
      ready: vi.fn(),
    };
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 55.801,
            longitude: 49.123,
            accuracy: 42,
          },
        }),
      ),
      watchPosition: vi.fn(() => 52),
      clearWatch: vi.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });
    mockedApiFetch
      .mockResolvedValueOnce({ rides: MOCK_RIDES })
      .mockResolvedValueOnce({ ...MOCK_RIDES[0], route_polyline: "mfp_I__vpAYBO@K@" });

    renderScreen();

    await waitFor(() => expect(L.marker).toHaveBeenCalled());
    const rideMarker = vi.mocked(L.marker).mock.results[0]?.value as
      | { on: ReturnType<typeof vi.fn> }
      | undefined;
    const map = vi.mocked(L.map).mock.results[0]?.value as
      | { dragging: { disable: ReturnType<typeof vi.fn>; enable: ReturnType<typeof vi.fn> } }
      | undefined;

    const btn = screen.getByTestId("locate-me");
    fireEvent.click(btn);
    await waitFor(() => expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled());
    window.dispatchEvent(
      new MockDeviceOrientationEvent("deviceorientation", { webkitCompassHeading: 90 }),
    );
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute("aria-pressed", "true"));

    const clickHandler = rideMarker?.on.mock.calls.find(([event]) => event === "click")?.[1] as
      | (() => void)
      | undefined;

    await act(async () => {
      clickHandler?.();
    });

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/rides/ride-1");
      expect(btn).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTestId("leaflet-container").style.transform).toBe("rotate(0deg)");
      expect(map?.dragging.enable).toHaveBeenCalled();
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
