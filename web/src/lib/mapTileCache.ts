export const OSM_TILE_CACHE_NAME = "osm-tiles-v1";

export async function clearOsmTileCache(): Promise<void> {
  if (typeof caches === "undefined") return;

  await caches.delete(OSM_TILE_CACHE_NAME);
}
