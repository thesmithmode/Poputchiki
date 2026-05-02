import { describe, expect, it } from "vitest";
import { LikeDTO } from "../../src/schemas/like.js";

const validLike = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  subject_id: "550e8400-e29b-41d4-a716-446655440000",
  target_id: "550e8400-e29b-41d4-a716-446655440001",
  ride_id: "550e8400-e29b-41d4-a716-446655440003",
  created_at: "2026-05-01T00:00:00Z",
};

describe("LikeDTO", () => {
  it("accepts valid like", () => {
    expect(LikeDTO.safeParse(validLike).success).toBe(true);
  });

  it("rejects missing subject_id", () => {
    const { subject_id, ...rest } = validLike;
    expect(LikeDTO.safeParse(rest).success).toBe(false);
  });

  it("rejects non-uuid ids", () => {
    expect(LikeDTO.safeParse({ ...validLike, id: "bad" }).success).toBe(false);
    expect(LikeDTO.safeParse({ ...validLike, subject_id: "bad" }).success).toBe(false);
    expect(LikeDTO.safeParse({ ...validLike, target_id: "bad" }).success).toBe(false);
    expect(LikeDTO.safeParse({ ...validLike, ride_id: "bad" }).success).toBe(false);
  });

  it("rejects missing created_at", () => {
    const { created_at, ...rest } = validLike;
    expect(LikeDTO.safeParse(rest).success).toBe(false);
  });
});
