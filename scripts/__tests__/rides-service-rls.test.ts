import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const migration034 = readFileSync(
  join(root, "db", "migrations", "034_rides_service_rls.sql"),
  "utf8",
);

describe("migration 034 rides service RLS", () => {
  it("requires the active service role instead of service-role membership", () => {
    expect(migration034).toContain("current_user = 'poputchiki_service'");
    expect(migration034).not.toContain(
      "pg_has_role(current_user, 'poputchiki_service', 'MEMBER')",
    );
  });
});
