import { describe, expect, it } from "vitest";
import mainSource from "../src/main.tsx?raw";
import viteConfigSource from "../vite.config.ts?raw";

describe("OSM tile cache privacy", () => {
  it("does not request persistent origin storage for map tile caches", () => {
    expect(mainSource).not.toMatch(/storage\??\.persist/);
  });

  it("deletes the legacy OSM tile runtime cache on startup", () => {
    expect(mainSource).toContain('caches.delete("osm-tiles-v1")');
  });

  it("does not configure a runtime cache for location-revealing OSM tile URLs", () => {
    expect(viteConfigSource).not.toContain("tile.openstreetmap.org");
    expect(viteConfigSource).not.toContain('handler: "CacheFirst"');
  });
});
