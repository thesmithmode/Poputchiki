import { describe, expect, it } from "vitest";
import { ReviewDTO } from "../../src/schemas/review.js";

const validReview = {
  id: "550e8400-e29b-41d4-a716-446655440004",
  ride_id: "550e8400-e29b-41d4-a716-446655440003",
  subject_id: "550e8400-e29b-41d4-a716-446655440000",
  target_id: "550e8400-e29b-41d4-a716-446655440001",
  stars: 5,
  text: "Отличный водитель, рекомендую!",
  created_at: "2026-05-01T00:00:00Z",
};

describe("ReviewDTO", () => {
  it("accepts valid review", () => {
    expect(ReviewDTO.safeParse(validReview).success).toBe(true);
  });

  it("accepts review without text", () => {
    const { text, ...rest } = validReview;
    expect(ReviewDTO.safeParse({ ...rest, text: null }).success).toBe(true);
  });

  it("accepts all star values 1-5", () => {
    for (const stars of [1, 2, 3, 4, 5]) {
      expect(ReviewDTO.safeParse({ ...validReview, stars }).success).toBe(true);
    }
  });

  it("rejects stars = 0", () => {
    expect(ReviewDTO.safeParse({ ...validReview, stars: 0 }).success).toBe(false);
  });

  it("rejects stars = 6", () => {
    expect(ReviewDTO.safeParse({ ...validReview, stars: 6 }).success).toBe(false);
  });

  it("rejects text longer than 300 chars", () => {
    expect(ReviewDTO.safeParse({ ...validReview, text: "x".repeat(301) }).success).toBe(false);
  });

  it("accepts text exactly 300 chars", () => {
    expect(ReviewDTO.safeParse({ ...validReview, text: "x".repeat(300) }).success).toBe(true);
  });

  it("rejects non-uuid ids", () => {
    expect(ReviewDTO.safeParse({ ...validReview, id: "bad" }).success).toBe(false);
    expect(ReviewDTO.safeParse({ ...validReview, ride_id: "bad" }).success).toBe(false);
  });

  it("rejects missing stars", () => {
    const { stars, ...rest } = validReview;
    expect(ReviewDTO.safeParse(rest).success).toBe(false);
  });
});
