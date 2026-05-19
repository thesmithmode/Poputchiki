import { describe, expect, it } from "vitest";
import { CreateRideInput, RideDTO } from "../../src/schemas/ride.js";

describe("CreateRideInput", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const base = {
    from_label: "  A  ",
    from_lat: 55,
    from_lng: 37,
    to_label: "  B  ",
    to_lat: 55,
    to_lng: 37.1,
    departure_at: future,
    seats_total: 2,
  };

  it("sanitizes labels + comment=null untouched", () => {
    const out = CreateRideInput.parse({ ...base, comment: null });
    expect(out.from_label).toBe("A");
    expect(out.to_label).toBe("B");
    expect(out.comment).toBeNull();
  });

  it("comment string passes through transform", () => {
    const out = CreateRideInput.parse({ ...base, comment: "  hi  " });
    expect(out.comment).toBe("hi");
  });

  it("rejects past departure_at", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(CreateRideInput.safeParse({ ...base, departure_at: past }).success).toBe(false);
  });

  it("rejects same from/to coordinates", () => {
    const r = CreateRideInput.safeParse({
      ...base,
      from_lat: 55.7558,
      from_lng: 49.1,
      to_lat: 55.7558,
      to_lng: 49.1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects from/to within 50m (same point in practice)", () => {
    // ~10m apart — should still be rejected
    const r = CreateRideInput.safeParse({
      ...base,
      from_lat: 55.7558,
      from_lng: 49.1,
      to_lat: 55.75581,
      to_lng: 49.10001,
    });
    expect(r.success).toBe(false);
  });

  it("accepts from/to further than 50m apart", () => {
    const r = CreateRideInput.safeParse({
      ...base,
      from_lat: 55.7558,
      from_lng: 49.1,
      to_lat: 55.76,
      to_lng: 49.105,
    });
    expect(r.success).toBe(true);
  });
});

const validRide = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  driver_id: "550e8400-e29b-41d4-a716-446655440000",
  template_id: null,
  from_label: "ЖК Царёво, к.1",
  from_lat: 55.7558,
  from_lng: 37.6173,
  to_label: "Метро Выхино",
  to_lat: 55.7272,
  to_lng: 37.864,
  departure_at: "2026-05-10T07:30:00Z",
  price_rub: null,
  seats_total: 3,
  seats_taken: 1,
  comment: "Беру попутчиков до метро",
  status: "active" as const,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("RideDTO", () => {
  it("accepts valid ride", () => {
    expect(RideDTO.safeParse(validRide).success).toBe(true);
  });

  it("accepts ride with price", () => {
    expect(RideDTO.safeParse({ ...validRide, price_rub: 150 }).success).toBe(true);
  });

  it("accepts all statuses", () => {
    for (const status of ["active", "cancelled", "completed", "archived"]) {
      expect(RideDTO.safeParse({ ...validRide, status }).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(RideDTO.safeParse({ ...validRide, status: "unknown" }).success).toBe(false);
  });

  it("rejects seats_total = 0", () => {
    expect(RideDTO.safeParse({ ...validRide, seats_total: 0 }).success).toBe(false);
  });

  it("rejects seats_total = 5 (max 4)", () => {
    expect(RideDTO.safeParse({ ...validRide, seats_total: 5 }).success).toBe(false);
  });

  it("rejects comment longer than 200 chars", () => {
    expect(RideDTO.safeParse({ ...validRide, comment: "x".repeat(201) }).success).toBe(false);
  });

  it("accepts comment exactly 200 chars", () => {
    expect(RideDTO.safeParse({ ...validRide, comment: "x".repeat(200) }).success).toBe(true);
  });

  it("rejects missing driver_id", () => {
    const { driver_id, ...rest } = validRide;
    expect(RideDTO.safeParse(rest).success).toBe(false);
  });

  it("rejects non-uuid driver_id", () => {
    expect(RideDTO.safeParse({ ...validRide, driver_id: "bad" }).success).toBe(false);
  });

  it("rejects invalid lat/lng", () => {
    expect(RideDTO.safeParse({ ...validRide, from_lat: 200 }).success).toBe(false);
    expect(RideDTO.safeParse({ ...validRide, from_lng: -300 }).success).toBe(false);
  });
});
