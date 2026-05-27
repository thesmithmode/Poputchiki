import { describe, expect, it } from "vitest";
import {
  type RideRequestStatusMap,
  VIEWED_RIDES_KEY,
  getRideCardState,
  markRideViewed,
  readViewedRideIds,
} from "../src/lib/rideCardState";
import type { Ride } from "../src/types/ride";

const ride: Ride = {
  id: "ride-1",
  driver_id: "driver-1",
  from_label: "ЖК Царёво",
  from_lat: 55.75,
  from_lng: 49.1,
  to_label: "Казань",
  to_lat: 55.79,
  to_lng: 49.12,
  departure_at: new Date(Date.now() + 3600000).toISOString(),
  price_rub: 150,
  seats_total: 3,
  seats_taken: 1,
  status: "active",
  comment: null,
  created_at: new Date().toISOString(),
};

describe("rideCardState", () => {
  it("считает состояние с приоритетом own > accepted > pending > viewed > default", () => {
    const requests: RideRequestStatusMap = new Map([["ride-1", "pending"]]);
    expect(getRideCardState(ride, "driver-1", requests, new Set(["ride-1"]))).toBe("own");

    expect(getRideCardState(ride, "user-1", new Map([["ride-1", "accepted"]]), new Set())).toBe(
      "approved",
    );

    expect(getRideCardState(ride, "user-1", requests, new Set(["ride-1"]))).toBe("applied");
    expect(getRideCardState(ride, "user-1", new Map(), new Set(["ride-1"]))).toBe("viewed");
    expect(getRideCardState(ride, "user-1", new Map(), new Set())).toBe("default");
  });

  it("читает и обновляет список просмотренных поездок в localStorage с лимитом 200", () => {
    localStorage.setItem(
      VIEWED_RIDES_KEY,
      JSON.stringify(Array.from({ length: 200 }, (_, i) => `old-${i}`)),
    );

    const next = markRideViewed("ride-new", readViewedRideIds());

    expect(next.has("ride-new")).toBe(true);
    expect(next.has("old-0")).toBe(false);
    expect(JSON.parse(localStorage.getItem(VIEWED_RIDES_KEY) ?? "[]")).toHaveLength(200);
  });
});
