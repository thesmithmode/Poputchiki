import { describe, expect, it } from "vitest";
import {
  formatRouteDistance,
  formatRouteDuration,
  formatRouteMetrics,
} from "../src/lib/routeMetrics";

describe("routeMetrics", () => {
  it("formats duration-only routes for old rides without distance", () => {
    expect(formatRouteMetrics(null, 35 * 60)).toBe("~35 мин");
  });

  it("formats distance and duration together", () => {
    expect(formatRouteMetrics(12_340, 75 * 60)).toBe("12.3 км · ~1 ч 15 мин");
  });

  it("ignores empty route metrics", () => {
    expect(formatRouteDistance(0)).toBeNull();
    expect(formatRouteDuration(null)).toBeNull();
  });
});
