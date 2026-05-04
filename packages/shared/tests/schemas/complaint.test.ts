import { describe, expect, it } from "vitest";
import { ComplaintInput } from "../../src/schemas/complaint.js";

const base = {
  target_id: "550e8400-e29b-41d4-a716-446655440000",
  body: "abuse report",
};

describe("ComplaintInput", () => {
  it("accepts valid", () => {
    expect(ComplaintInput.safeParse(base).success).toBe(true);
  });

  it("sanitizes body via transform", () => {
    const out = ComplaintInput.parse({ ...base, body: "  spam  " });
    expect(out.body).toBe("spam");
  });

  it("ride_id optional/nullable", () => {
    expect(ComplaintInput.safeParse({ ...base, ride_id: null }).success).toBe(true);
  });

  it("rejects empty body", () => {
    expect(ComplaintInput.safeParse({ ...base, body: "" }).success).toBe(false);
  });

  it("rejects body >500", () => {
    expect(ComplaintInput.safeParse({ ...base, body: "x".repeat(501) }).success).toBe(false);
  });

  it("rejects non-uuid target_id", () => {
    expect(ComplaintInput.safeParse({ ...base, target_id: "bad" }).success).toBe(false);
  });
});
