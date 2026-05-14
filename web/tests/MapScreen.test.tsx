import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapScreen } from "../src/screens/MapScreen";

vi.mock("../src/lib/telegram", () => ({ getTelegramWebApp: () => undefined }));

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
    },
    map: vi.fn(() => mockMap),
    marker: vi.fn(() => mockMarker),
    polyline: vi.fn(() => mockPolyline),
    tileLayer: vi.fn(() => mockTileLayer),
    circleMarker: vi.fn(() => mockCircleMarker),
  };
});

vi.mock("leaflet.markercluster", () => ({
  default: {},
  MarkerClusterGroup: vi.fn(() => ({
    addLayer: vi.fn(),
  })),
}));

import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

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
    vi.resetAllMocks();
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

  it("показывает счётчик поездок после загрузки", async () => {
    mockedApiFetch.mockResolvedValueOnce({ rides: MOCK_RIDES });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("rides-count")).toBeInTheDocument();
    });
    expect(screen.getByTestId("rides-count")).toHaveTextContent("1 поездок");
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

  it("не показывает rides-count пока loading", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.queryByTestId("rides-count")).not.toBeInTheDocument();
  });

  it("показывает 0 поездок при пустом ответе", async () => {
    mockedApiFetch.mockResolvedValueOnce({ rides: [] });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("rides-count")).toHaveTextContent("0 поездок");
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
});
