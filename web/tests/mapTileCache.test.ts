import { beforeEach, describe, expect, it, vi } from "vitest";
import { OSM_TILE_CACHE_NAME, clearOsmTileCache } from "../src/lib/mapTileCache";

describe("mapTileCache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears the OSM tile cache when CacheStorage is available", async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: deleteCache });

    await clearOsmTileCache();

    expect(deleteCache).toHaveBeenCalledWith(OSM_TILE_CACHE_NAME);
  });

  it("does not fail logout flows when CacheStorage is unavailable", async () => {
    vi.stubGlobal("caches", undefined);

    await expect(clearOsmTileCache()).resolves.toBeUndefined();
  });
});
