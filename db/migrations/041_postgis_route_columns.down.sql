DROP INDEX IF EXISTS idx_rides_route_geom_geog;

ALTER TABLE rides
  DROP COLUMN IF EXISTS route_geom,
  DROP COLUMN IF EXISTS route_polyline,
  DROP COLUMN IF EXISTS route_distance_m,
  DROP COLUMN IF EXISTS route_duration_s;

ALTER TABLE ride_templates
  DROP COLUMN IF EXISTS route_geom,
  DROP COLUMN IF EXISTS route_polyline,
  DROP COLUMN IF EXISTS route_distance_m,
  DROP COLUMN IF EXISTS route_duration_s;

-- postgis extension не удаляем — может использоваться другими объектами
