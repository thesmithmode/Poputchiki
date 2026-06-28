import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..", "..", "..");
const migrationsDir = join(root, "db", "migrations");

function readMigration(fileName: string): string {
  return readFileSync(join(migrationsDir, fileName), "utf8");
}

function latestForwardMigration(): string {
  const upFiles = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql") && !fileName.endsWith(".down.sql"))
    .sort();

  const latest = upFiles.at(-1);
  if (!latest) throw new Error("No SQL migrations found");
  return latest;
}

describe("migration upgrade safety", () => {
  it("has a forward migration that backfills historical updated_at and notify columns", () => {
    const latest = latestForwardMigration();
    const sql = readMigration(latest);

    expect(sql).toContain("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at");
    expect(sql).toContain("ALTER TABLE ride_templates ADD COLUMN IF NOT EXISTS updated_at");
    expect(sql).toContain("ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS updated_at");
    expect(sql).toContain(
      "ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS updated_at",
    );
    expect(sql).toContain("ALTER TABLE favorites ADD COLUMN IF NOT EXISTS notify");
  });

  it("creates updated_at triggers idempotently for databases that already ran migration 007", () => {
    const latest = latestForwardMigration();
    const sql = readMigration(latest);

    for (const triggerName of [
      "trg_updated_at_rides",
      "trg_updated_at_ride_templates",
      "trg_updated_at_users",
      "trg_updated_at_support_messages",
      "trg_updated_at_notification_preferences",
    ]) {
      expect(sql).toContain(triggerName);
    }
    expect(sql).toContain("pg_trigger");
    expect(sql).toContain("CREATE TRIGGER");
  });
});
