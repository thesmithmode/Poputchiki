import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("service role RLS hardening", () => {
  it("baseline migration never grants BYPASSRLS to poputchiki_service", () => {
    const migration = readRepoFile("db/migrations/000_app_identity.sql");

    expect(migration).not.toMatch(/ALTER\s+ROLE\s+poputchiki_service\s+BYPASSRLS\b/i);
    expect(migration).toMatch(/ALTER\s+ROLE\s+poputchiki_service\s+NOBYPASSRLS\b/i);
  });

  it("postgres init keeps poputchiki_service as an RLS-bound non-login role", () => {
    const initSql = readRepoFile("infra/postgres/init/01-app-role.sql");

    expect(initSql).toMatch(/ALTER\s+ROLE\s+poputchiki_service\s+NOBYPASSRLS\b/i);
    expect(initSql).not.toMatch(/ALTER\s+ROLE\s+poputchiki_service\s+BYPASSRLS\b/i);
  });
});
