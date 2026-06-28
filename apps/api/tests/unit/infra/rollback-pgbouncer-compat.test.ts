import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../../../");
const COMPOSE = readFileSync(join(ROOT, "infra/docker-compose.prod.yml"), "utf8");
const ROLLBACK = readFileSync(join(ROOT, "scripts/rollback.sh"), "utf8");

describe("rollback PgBouncer compatibility", () => {
  it("allows rollback.sh to override API query traffic back to direct Postgres", () => {
    expect(COMPOSE).toContain(
      "DATABASE_URL: postgres://poputchiki_app:${APP_DB_PASSWORD}@${API_DATABASE_HOST:-pgbouncer}:${API_DATABASE_PORT:-6432}/${POSTGRES_DB}",
    );
    expect(ROLLBACK).toContain("API_DATABASE_HOST=\"postgres\"");
    expect(ROLLBACK).toContain("API_DATABASE_PORT=\"5432\"");
    expect(ROLLBACK).toContain("API_DATABASE_DIRECT_HOST=\"$API_DATABASE_HOST\"");
    expect(ROLLBACK).toContain("API_DATABASE_DIRECT_PORT=\"$API_DATABASE_PORT\"");
  });
});
