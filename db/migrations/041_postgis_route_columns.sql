-- Migration 041: PostGIS extension + route geometry columns + functional GiST index
-- Зависимость: postgis/postgis:16-3.4-alpine image (DROP-IN замена postgres:16-alpine)

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE rides
  ADD COLUMN route_geom       geometry(LineString, 4326),
  ADD COLUMN route_polyline    text,
  ADD COLUMN route_distance_m  integer,
  ADD COLUMN route_duration_s  integer;

ALTER TABLE ride_templates
  ADD COLUMN route_geom       geometry(LineString, 4326),
  ADD COLUMN route_polyline    text,
  ADD COLUMN route_distance_m  integer,
  ADD COLUMN route_duration_s  integer;

-- Функциональный GiST индекс: ST_DWithin(geography(route_geom), ...) использует geography cast,
-- обычный GiST на geometry column не матчится. Partial — только строки с маршрутом.
CREATE INDEX idx_rides_route_geom_geog
  ON rides USING GIST (geography(route_geom))
  WHERE route_geom IS NOT NULL;
