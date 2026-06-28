import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = join(root, "db", "migrations");

describe("app role migration delivery", () => {
  it("delivers poputchiki_app grants in a forward migration after base 000", () => {
    const roleMigration = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql") && !file.endsWith(".down.sql"))
      .filter((file) => file !== "000_app_identity.sql")
      .find((file) => {
        const sql = readFileSync(join(migrationsDir, file), "utf8");
        return (
          sql.includes("CREATE ROLE poputchiki_app") &&
          sql.includes(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO poputchiki_app",
          ) &&
          sql.includes("ALTER DEFAULT PRIVILEGES IN SCHEMA public")
        );
      });

    expect(roleMigration).toBeDefined();
  });
});
