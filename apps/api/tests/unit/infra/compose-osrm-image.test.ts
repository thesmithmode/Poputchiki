import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PROD_COMPOSE_PATH = join(__dirname, "../../../../../infra/docker-compose.prod.yml");

describe("infra/docker-compose.prod.yml — OSRM image pinning", () => {
  const compose = readFileSync(PROD_COMPOSE_PATH, "utf-8");

  it("SENTINEL: production OSRM containers do not use mutable latest tags", () => {
    expect(compose).not.toMatch(/ghcr\.io\/project-osrm\/osrm-backend:latest\b/);
  });

  it("pins production OSRM containers to an immutable digest", () => {
    const osrmImageRefs = [...compose.matchAll(/image:\s*(ghcr\.io\/project-osrm\/osrm-backend:[^\s]+)/g)].map(
      ([, image]) => image,
    );

    expect(osrmImageRefs).toHaveLength(2);
    expect(osrmImageRefs).toEqual(
      osrmImageRefs.map((image) => expect.stringMatching(/^ghcr\.io\/project-osrm\/osrm-backend:v\d+\.\d+\.\d+@sha256:[a-f0-9]{64}$/)),
    );
  });
});
