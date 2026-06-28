import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");
const migrationsDir = join(repoRoot, "db", "migrations");
const upgradeMigration = join(migrationsDir, "043_security_patch_upgrade_path.sql");
const upgradeRollback = join(migrationsDir, "043_security_patch_upgrade_path.down.sql");

describe("security patch migration upgrade path", () => {
  it("keeps a standalone forward migration for databases that already applied rewritten migrations", () => {
    expect(existsSync(upgradeMigration)).toBe(true);

    const sql = readFileSync(upgradeMigration, "utf-8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.book_seat");
    expect(sql).toContain("RETURNS SETOF rides");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.book_seat(uuid) TO poputchiki_app");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION complaint_week_utc");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS complaints_unique_per_week_idx");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.trg_likes_update_count()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.trg_rides_insert_count()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.trg_rides_completed_count()");
    expect(sql).toContain("SECURITY DEFINER SET search_path = pg_catalog, public");
  });

  it("does not roll back shared security controls that may be owned by older migrations", () => {
    expect(existsSync(upgradeRollback)).toBe(true);

    const sql = readFileSync(upgradeRollback, "utf-8");

    expect(sql).toContain("Intentionally empty");
    expect(sql).not.toContain("DROP FUNCTION");
    expect(sql).not.toContain("DROP INDEX");
  });
});
