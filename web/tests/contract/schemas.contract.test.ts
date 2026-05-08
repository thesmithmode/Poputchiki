import {
  ComplaintInput,
  CreateReviewInput,
  CreateRideInput,
  LikeDTO,
  ReviewDTO,
  RideDTO,
  RideStatus,
  SupportMessageInput,
  UserDTO,
  UserProfileInput,
} from "@poputchiki/shared";
/**
 * Contract tests: verify web uses the same shared schemas for response typing.
 */
import { describe, expect, it } from "vitest";
import type { z } from "zod";

describe("web contract: shared schemas are importable and valid Zod schemas", () => {
  const schemas: Record<string, z.ZodTypeAny> = {
    UserDTO,
    UserProfileInput,
    RideDTO,
    RideStatus,
    CreateRideInput,
    LikeDTO,
    ReviewDTO,
    CreateReviewInput,
    ComplaintInput,
    SupportMessageInput,
  };

  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name} is a valid Zod schema`, () => {
      expect(schema).toBeDefined();
      expect(typeof schema.parse).toBe("function");
      expect(typeof schema.safeParse).toBe("function");
    });
  }
});

describe("web contract: UserDTO shape", () => {
  it("парсит валидный UserDTO", () => {
    const valid = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      tg_id: 123456789,
      tg_username: "testuser",
      display_name: "Иван",
      is_verified: false,
      is_banned: false,
      notify_disabled: false,
      role: "user",
      likes_received_count: 0,
      rides_total_count: 0,
      rides_completed_count: 0,
      created_at: "2024-01-01T00:00:00.000Z",
      last_seen_at: "2024-01-01T00:00:00.000Z",
    };
    expect(() => UserDTO.parse(valid)).not.toThrow();
  });

  it("отклоняет UserDTO без обязательных полей", () => {
    expect(UserDTO.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("web contract: CreateRideInput shape", () => {
  it("принимает валидный CreateRideInput", () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const valid = {
      from_label: "Дом",
      from_lat: 55.75,
      from_lng: 37.62,
      to_label: "Работа",
      to_lat: 55.76,
      to_lng: 37.63,
      departure_at: future,
      seats_total: 3,
    };
    expect(CreateRideInput.safeParse(valid).success).toBe(true);
  });
});

describe("web contract: RideStatus values", () => {
  it("принимает все 4 статуса", () => {
    for (const s of ["active", "cancelled", "completed", "archived"]) {
      expect(RideStatus.safeParse(s).success).toBe(true);
    }
  });
});
