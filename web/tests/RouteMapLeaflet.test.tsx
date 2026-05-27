import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouteMapLeaflet } from "../src/components/RouteMapLeaflet";

const mockMap = {
  fitBounds: vi.fn(),
  removeLayer: vi.fn(),
  remove: vi.fn(),
};
const mockPolyline = { addTo: vi.fn(() => mockPolyline) };
const mockMarker = { addTo: vi.fn(() => mockMarker) };
const mockTileLayer = { addTo: vi.fn(() => mockTileLayer) };

vi.mock("leaflet", () => ({
  default: {},
  map: vi.fn(() => mockMap),
  marker: vi.fn(() => mockMarker),
  polyline: vi.fn(() => mockPolyline),
  tileLayer: vi.fn(() => mockTileLayer),
  divIcon: vi.fn((options) => options),
  latLngBounds: vi.fn((points) => ({ points })),
}));

describe("RouteMapLeaflet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("draws a visible dashed fallback line and pending status when OSRM route is not ready", async () => {
    const L = await import("leaflet");

    render(<RouteMapLeaflet fromLat={55.81} fromLng={49.44} toLat={55.79} toLng={49.12} />);

    await waitFor(() => {
      expect(L.polyline).toHaveBeenCalledWith(
        [
          [55.81, 49.44],
          [55.79, 49.12],
        ],
        expect.objectContaining({
          dashArray: "6 5",
          opacity: expect.any(Number),
        }),
      );
    });
    expect(screen.getByTestId("route-map-status")).toHaveTextContent("Маршрут по дорогам строится");
  });
  it("replaces the fallback line when a road route polyline arrives after mount", async () => {
    const L = await import("leaflet");

    const { rerender } = render(
      <RouteMapLeaflet fromLat={55.81} fromLng={49.44} toLat={55.79} toLng={49.12} />,
    );

    await waitFor(() => {
      expect(L.polyline).toHaveBeenCalledWith(
        [
          [55.81, 49.44],
          [55.79, 49.12],
        ],
        expect.objectContaining({ dashArray: "6 5" }),
      );
    });

    rerender(
      <RouteMapLeaflet
        fromLat={55.81}
        fromLng={49.44}
        toLat={55.79}
        toLng={49.12}
        routePolyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@"
      />,
    );

    await waitFor(() => {
      expect(mockMap.removeLayer).toHaveBeenCalled();
      expect(L.map).toHaveBeenCalledTimes(1);
      expect(L.polyline).toHaveBeenLastCalledWith(
        [
          [38.5, -120.2],
          [40.7, -120.95],
          [43.252, -126.453],
        ],
        expect.not.objectContaining({ dashArray: expect.any(String) }),
      );
    });
    expect(screen.queryByTestId("route-map-status")).not.toBeInTheDocument();
  });
});
