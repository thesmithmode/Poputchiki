import { limitLength, normalizeWhitespace, stripHtml } from "@poputchiki/shared/sanitize";
/**
 * Security: UGC sanitization helpers.
 * Verifies XSS payloads are neutralized before storage.
 */
import { describe, expect, it } from "vitest";

describe("stripHtml", () => {
  it("removes script tags and content", () => {
    expect(stripHtml('<script>alert("xss")</script>Hello')).toBe("Hello");
  });

  it("removes img onerror handler", () => {
    const result = stripHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<img");
  });

  it("removes arbitrary HTML tags", () => {
    expect(stripHtml("<b>bold</b> text")).toBe("bold text");
  });

  it("removes svg onload payload", () => {
    const result = stripHtml('<svg onload="alert(1)">');
    expect(result).not.toContain("onload");
    expect(result).not.toContain("<svg");
  });

  it("removes iframe src", () => {
    const result = stripHtml('<iframe src="evil.com"></iframe>text');
    expect(result).not.toContain("<iframe");
    expect(result).toContain("text");
  });

  it("preserves plain text unchanged", () => {
    expect(stripHtml("Привет, мир!")).toBe("Привет, мир!");
  });

  it("empty string stays empty", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("normalizeWhitespace", () => {
  it("collapses multiple spaces", () => {
    expect(normalizeWhitespace("Hello   World")).toBe("Hello World");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeWhitespace("  Hello  ")).toBe("Hello");
  });

  it("replaces tabs and newlines with single space", () => {
    expect(normalizeWhitespace("Hello\t\nWorld")).toBe("Hello World");
  });

  it("empty string stays empty", () => {
    expect(normalizeWhitespace("")).toBe("");
  });
});

describe("limitLength", () => {
  it("truncates to max length", () => {
    expect(limitLength("Hello World", 5)).toBe("Hello");
  });

  it("does not truncate if within limit", () => {
    expect(limitLength("Hi", 100)).toBe("Hi");
  });

  it("handles exact length boundary", () => {
    expect(limitLength("Hello", 5)).toBe("Hello");
  });

  it("empty string returns empty", () => {
    expect(limitLength("", 10)).toBe("");
  });
});

describe("Zod schema sanitize transforms: UGC fields", () => {
  it("CreateRideInput.comment strips HTML", async () => {
    const { CreateRideInput } = await import("@poputchiki/shared");
    const baseInput = {
      from_label: "Дом",
      from_lat: 55.7,
      from_lng: 37.6,
      to_label: "Работа",
      to_lat: 55.8,
      to_lng: 37.7,
      departure_at: new Date(Date.now() + 86400000).toISOString(),
      seats_total: 2,
    };
    const result = CreateRideInput.safeParse({
      ...baseInput,
      comment: "<script>alert(1)</script>Везу людей",
    });
    if (!result.success) throw result.error;
    expect(result.data.comment).not.toContain("<script>");
    expect(result.data.comment).toContain("Везу людей");
  });

  it("display_name in UserProfileInput strips HTML", async () => {
    const { UserProfileInput } = await import("@poputchiki/shared");
    const result = UserProfileInput.safeParse({
      display_name: "<b>Hacker</b>",
    });
    if (!result.success) throw result.error;
    expect(result.data.display_name).not.toContain("<b>");
    expect(result.data.display_name).toContain("Hacker");
  });
});
