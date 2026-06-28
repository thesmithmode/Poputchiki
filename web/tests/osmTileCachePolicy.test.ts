import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OSM tile cache policy", () => {
  it("keeps map tile history short-lived", () => {
    const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

    expect(viteConfig).toContain("maxEntries: 1000");
    expect(viteConfig).toContain("maxAgeSeconds: 7 * 24 * 60 * 60");
    expect(viteConfig).not.toContain("maxAgeSeconds: 365 * 24 * 60 * 60");
  });
});
