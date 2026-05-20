import { describe, expect, it } from "vitest";
import { limitLength, normalizeWhitespace, sanitizeText, stripHtml } from "../src/sanitize";

describe("stripHtml", () => {
  it("removes script tags and content", () => {
    expect(stripHtml('<script>alert("xss")</script>Hello')).toBe("Hello");
  });

  it("removes style tags and content", () => {
    expect(stripHtml("<style>body{}</style>Text")).toBe("Text");
  });

  it("removes generic HTML tags", () => {
    expect(stripHtml("<b>bold</b> text")).toBe("bold text");
  });

  it("preserves plain text", () => {
    expect(stripHtml("Привет")).toBe("Привет");
  });

  it("empty string stays empty", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("normalizeWhitespace", () => {
  it("collapses multiple whitespace into single space", () => {
    expect(normalizeWhitespace("a   b\t\nc")).toBe("a b c");
  });

  it("trims edges", () => {
    expect(normalizeWhitespace("  x  ")).toBe("x");
  });
});

describe("limitLength", () => {
  it("returns original when length <= max", () => {
    expect(limitLength("Hi", 100)).toBe("Hi");
  });

  it("returns original at exact boundary", () => {
    expect(limitLength("Hello", 5)).toBe("Hello");
  });

  it("truncates when length > max", () => {
    expect(limitLength("Hello World", 5)).toBe("Hello");
  });

  it("empty string stays empty", () => {
    expect(limitLength("", 10)).toBe("");
  });
});

describe("sanitizeText", () => {
  it("pipelines stripHtml → normalize → limit", () => {
    expect(sanitizeText("<b>Hello   World</b>", 8)).toBe("Hello Wo");
  });
});
