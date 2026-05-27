import { describe, expect, it } from "vitest";
import { estimateEta, formatEtaRange } from "../../../src/routing/etaUtils";

describe("estimateEta", () => {
  it("applies morning rush coefficient (7-9 → ×1.4)", () => {
    const { minS, maxS } = estimateEta(600, 8);
    expect(minS).toBe(Math.round(600 * 1.4 * 0.9));
    expect(maxS).toBe(Math.round(600 * 1.4 * 1.1));
  });

  it("applies evening rush coefficient (17-19 → ×1.35)", () => {
    const { minS, maxS } = estimateEta(600, 18);
    expect(minS).toBe(Math.round(600 * 1.35 * 0.9));
    expect(maxS).toBe(Math.round(600 * 1.35 * 1.1));
  });

  it("applies moderate coefficient (9-11 → ×1.15)", () => {
    const { minS, maxS } = estimateEta(1000, 10);
    expect(minS).toBe(Math.round(1000 * 1.15 * 0.9));
    expect(maxS).toBe(Math.round(1000 * 1.15 * 1.1));
  });

  it("applies moderate coefficient (15-17 → ×1.15)", () => {
    const { minS, maxS } = estimateEta(1000, 16);
    expect(minS).toBe(Math.round(1000 * 1.15 * 0.9));
    expect(maxS).toBe(Math.round(1000 * 1.15 * 1.1));
  });

  it("applies baseline coefficient (11-15 → ×1.0)", () => {
    const { minS, maxS } = estimateEta(300, 12);
    expect(minS).toBe(Math.round(300 * 0.9));
    expect(maxS).toBe(Math.round(300 * 1.1));
  });

  it("applies night coefficient (22-24 → ×0.9)", () => {
    const { minS, maxS } = estimateEta(600, 23);
    expect(minS).toBe(Math.round(600 * 0.9 * 0.9));
    expect(maxS).toBe(Math.round(600 * 0.9 * 1.1));
  });

  it("applies early night coefficient (0-6 → ×0.9)", () => {
    const { minS, maxS } = estimateEta(600, 3);
    expect(minS).toBe(Math.round(600 * 0.9 * 0.9));
    expect(maxS).toBe(Math.round(600 * 0.9 * 1.1));
  });

  it("applies dawn coefficient (6-7 → ×1.0)", () => {
    const { minS, maxS } = estimateEta(500, 6);
    expect(minS).toBe(Math.round(500 * 0.9));
    expect(maxS).toBe(Math.round(500 * 1.1));
  });

  it("applies evening coefficient (19-22 → ×1.0)", () => {
    const { minS, maxS } = estimateEta(500, 20);
    expect(minS).toBe(Math.round(500 * 0.9));
    expect(maxS).toBe(Math.round(500 * 1.1));
  });

  it("boundary: hour 7 hits morning rush", () => {
    const { minS } = estimateEta(100, 7);
    expect(minS).toBe(Math.round(100 * 1.4 * 0.9));
  });

  it("boundary: hour 9 exits morning rush into moderate", () => {
    const { minS } = estimateEta(100, 9);
    expect(minS).toBe(Math.round(100 * 1.15 * 0.9));
  });
});

describe("formatEtaRange", () => {
  it("formats range with different min/max", () => {
    expect(formatEtaRange(900, 1200)).toBe("~15-20 мин");
  });

  it("formats equal min/max as single value", () => {
    expect(formatEtaRange(120, 120)).toBe("~2 мин");
  });

  it("rounds up to nearest minute", () => {
    expect(formatEtaRange(61, 121)).toBe("~2-3 мин");
  });

  it("handles small values", () => {
    expect(formatEtaRange(30, 90)).toBe("~1-2 мин");
  });
});
