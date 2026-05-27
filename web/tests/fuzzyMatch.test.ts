import { describe, expect, it } from "vitest";
import { fuzzyMatchSaved } from "../src/lib/fuzzyMatch";

describe("fuzzyMatchSaved", () => {
  it("matches single first letter", () => {
    expect(fuzzyMatchSaved("К", "Курорт")).toBe(true);
    expect(fuzzyMatchSaved("к", "Курорт")).toBe(true);
  });

  it("matches exact prefix", () => {
    expect(fuzzyMatchSaved("Кур", "Курорт")).toBe(true);
    expect(fuzzyMatchSaved("Курорт", "Курорт")).toBe(true);
  });

  it("matches subsequence with skipped letters", () => {
    expect(fuzzyMatchSaved("Куорт", "Курорт")).toBe(true);
    expect(fuzzyMatchSaved("Крт", "Курорт")).toBe(true);
    expect(fuzzyMatchSaved("Корт", "Курорт")).toBe(true);
  });

  it("rejects when first letter differs", () => {
    expect(fuzzyMatchSaved("Дом", "Курорт")).toBe(false);
    expect(fuzzyMatchSaved("Тук", "Курорт")).toBe(false);
    expect(fuzzyMatchSaved("О", "Курорт")).toBe(false);
  });

  it("rejects when subsequence fails", () => {
    expect(fuzzyMatchSaved("Кзя", "Курорт")).toBe(false);
    expect(fuzzyMatchSaved("Курортик", "Курорт")).toBe(false);
  });

  it("normalizes ё to е", () => {
    expect(fuzzyMatchSaved("Царёво", "Царево")).toBe(true);
    expect(fuzzyMatchSaved("Царево", "Царёво")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatchSaved("курорт", "КУРОРТ")).toBe(true);
    expect(fuzzyMatchSaved("КУРОРТ", "курорт")).toBe(true);
  });

  it("handles empty query", () => {
    expect(fuzzyMatchSaved("", "Курорт")).toBe(false);
  });

  it("handles empty name", () => {
    expect(fuzzyMatchSaved("К", "")).toBe(false);
  });

  it("matches real-world examples", () => {
    expect(fuzzyMatchSaved("Д", "Дом")).toBe(true);
    expect(fuzzyMatchSaved("Дом", "Дом")).toBe(true);
    expect(fuzzyMatchSaved("Р", "Работа")).toBe(true);
    expect(fuzzyMatchSaved("Раб", "Работа")).toBe(true);
    expect(fuzzyMatchSaved("О", "Офис на Баумана")).toBe(true);
    expect(fuzzyMatchSaved("Оф", "Офис на Баумана")).toBe(true);
    expect(fuzzyMatchSaved("Офс", "Офис на Баумана")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(fuzzyMatchSaved("  К  ", "Курорт")).toBe(true);
    expect(fuzzyMatchSaved("К", "  Курорт  ")).toBe(true);
  });
});
