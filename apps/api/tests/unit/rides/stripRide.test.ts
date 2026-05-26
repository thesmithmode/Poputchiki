import { stripRide, stripRideCore, stripRideDetail, stripRideRequest } from "@poputchiki/shared";
import { describe, expect, it } from "vitest";

const baseRide = {
  id: "00000000-0000-0000-0000-000000000001",
  driver_id: "00000000-0000-0000-0000-000000000002",
  template_id: null,
  from_label: "Казань",
  from_lat: 55.8,
  from_lng: 49.1,
  to_label: "Царёво",
  to_lat: 55.9,
  to_lng: 49.2,
  departure_at: new Date("2026-06-01T10:00:00Z"),
  price_rub: 200,
  seats_total: 4,
  seats_taken: 1,
  comment: null,
  status: "active",
  created_at: new Date("2026-05-26T00:00:00Z"),
  updated_at: new Date("2026-05-26T00:00:00Z"),
};

describe("stripRide", () => {
  it("passes through known ride + driver fields", () => {
    const input = {
      ...baseRide,
      driver_display_name: "Антон",
      driver_photo_url: null,
      driver_tg_id: 12345,
      driver_avg_stars: 4.5,
      driver_reviews_count: 3,
    };
    const result = stripRide(input);
    expect(result).toEqual(input);
  });

  it("removes unknown fields", () => {
    const input = {
      ...baseRide,
      driver_display_name: "Антон",
      phone_enc: Buffer.from("secret"),
      internal_debug: true,
      _extra: 42,
    };
    const result = stripRide(input);
    expect(result).not.toHaveProperty("phone_enc");
    expect(result).not.toHaveProperty("internal_debug");
    expect(result).not.toHaveProperty("_extra");
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("driver_display_name");
  });
});

describe("stripRideCore", () => {
  it("keeps only core ride fields, strips driver_* join fields", () => {
    const input = {
      ...baseRide,
      driver_display_name: "Антон",
      driver_photo_url: null,
    };
    const result = stripRideCore(input);
    expect(result).not.toHaveProperty("driver_display_name");
    expect(result).not.toHaveProperty("driver_photo_url");
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("status");
    expect(Object.keys(result)).toHaveLength(17);
  });
});

describe("stripRideDetail", () => {
  it("keeps core fields + nested objects", () => {
    const input = {
      ...baseRide,
      driver: { id: "d1", first_name: "Антон" },
      passengers: [],
      pending_requests: [],
      my_request_id: null,
      my_request_status: null,
      my_subscription_id: null,
      my_subscription_status: null,
    };
    const result = stripRideDetail(input);
    expect(result).toHaveProperty("driver");
    expect(result).toHaveProperty("passengers");
    expect(result).toHaveProperty("pending_requests");
    expect(result).toHaveProperty("my_request_id");
    expect(result).toHaveProperty("my_subscription_status");
  });

  it("removes unknown fields from detail response", () => {
    const input = {
      ...baseRide,
      driver: { id: "d1" },
      passengers: [],
      leaked_secret: "oops",
    };
    const result = stripRideDetail(input);
    expect(result).not.toHaveProperty("leaked_secret");
    expect(result).toHaveProperty("driver");
  });
});

describe("stripRideRequest", () => {
  it("keeps only ride_request fields", () => {
    const input = {
      id: "00000000-0000-0000-0000-000000000099",
      ride_id: "00000000-0000-0000-0000-000000000001",
      passenger_id: "00000000-0000-0000-0000-000000000003",
      status: "pending",
      created_at: new Date("2026-05-26T12:00:00Z"),
      updated_at: new Date("2026-05-26T12:00:00Z"),
      extra_column: "should_not_leak",
    };
    const result = stripRideRequest(input);
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("ride_id");
    expect(result).toHaveProperty("passenger_id");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("created_at");
    expect(result).not.toHaveProperty("updated_at");
    expect(result).not.toHaveProperty("extra_column");
  });
});
