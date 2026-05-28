import { describe, expect, it } from "vitest";
import { compactAddressLabel, compactAddressTitle } from "../src/lib/addressFormat";

describe("addressFormat", () => {
  it("compacts Kazan/Tatarstan/Russia noise and keeps core parts", () => {
    const input = "Россия, Республика Татарстан, г. Казань, улица Баумана, 10, подъезд 2";
    const out = compactAddressLabel(input, { maxLen: 40 });
    expect(out).not.toMatch(/Россия|Татарстан|Казань/i);
    expect(out).toMatch(/Баумана/i);
  });

  it("returns stable short label for empty input", () => {
    expect(compactAddressLabel("", { maxLen: 20 })).toBe("");
  });

  it("provides full title when label is compacted", () => {
    const input =
      "Очень длинный адрес, который нужно сократить, чтобы не раздувать карточку поездки";
    const label = compactAddressLabel(input, { maxLen: 24 });
    const title = compactAddressTitle(input, label);
    expect(label.length).toBeLessThanOrEqual(24);
    expect(title).toBe(input);
  });
});
