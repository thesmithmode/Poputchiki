import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPOSE_PATH = join(__dirname, "../../../../../infra/docker-compose.prod.yml");

describe("infra/docker-compose.prod.yml — Nominatim PBF source", () => {
  const compose = readFileSync(COMPOSE_PATH, "utf-8");

  it("SENTINEL: не использует Geofabrik для PBF России (Geofabrik отдаёт 302 → требует OSM login)", () => {
    expect(compose).not.toMatch(/PBF_URL:\s*https?:\/\/[^\s]*geofabrik\.de\/russia/i);
  });

  it("SENTINEL: PBF_URL указывает на доступное зеркало openstreetmap.fr", () => {
    expect(compose).toMatch(
      /PBF_URL:\s*https:\/\/download\.openstreetmap\.fr\/extracts\/russia\/volga_federal_district\/tatarstan_republic-latest\.osm\.pbf/,
    );
  });

  it("nominatim сервис объявлен с image mediagis/nominatim:4.4", () => {
    expect(compose).toMatch(/nominatim:\s*\n[\s\S]*?image:\s*mediagis\/nominatim:4\.4/);
  });
});
