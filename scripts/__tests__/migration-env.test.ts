import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

describe("migration scripts", () => {
  it("load the local .env file while preserving explicit DATABASE_MIGRATOR_URL precedence", () => {
    const migrate = packageJson.scripts["db:migrate"];
    const migrateDown = packageJson.scripts["db:migrate:down"];

    for (const script of [migrate, migrateDown]) {
      expect(script).toContain('DATABASE_URL=${DATABASE_MIGRATOR_URL:-$DATABASE_URL}');
      expect(script).toContain("--envPath .env");
    }
  });
});
