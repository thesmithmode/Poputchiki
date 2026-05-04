import { describe, expect, it } from "vitest";
import { SupportMessageInput } from "../../src/schemas/support-message.js";

describe("SupportMessageInput", () => {
  it("accepts valid + sanitizes via transform", () => {
    const out = SupportMessageInput.parse({ body: "  help me  " });
    expect(out.body).toBe("help me");
  });

  it("rejects empty", () => {
    expect(SupportMessageInput.safeParse({ body: "" }).success).toBe(false);
  });

  it("rejects >1000", () => {
    expect(SupportMessageInput.safeParse({ body: "x".repeat(1001) }).success).toBe(false);
  });
});
