import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OSM tile PWA cache privacy", () => {
  it("keeps location-derived tile URLs for no more than 7 days and 1000 entries", () => {
    const viteConfig = readFileSync("web/vite.config.ts", "utf8");

    expect(viteConfig).toContain('cacheName: "osm-tiles-v1"');
    expect(viteConfig).toContain("maxEntries: 1000");
    expect(viteConfig).toContain("maxAgeSeconds: 7 * 24 * 60 * 60");
    expect(viteConfig).not.toContain("maxEntries: 3000");
    expect(viteConfig).not.toContain("365 * 24 * 60 * 60");
  });
});
