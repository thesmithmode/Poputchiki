import { GeoCache } from "../geocode/geoCache";

// 5000 entries (≥ одновременных юзеров), TTL 30s — rides редко меняются чаще
export const ridesCache = new GeoCache(5_000, 30_000);
