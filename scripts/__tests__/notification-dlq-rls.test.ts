import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");

describe("notification_dlq RLS migration", () => {
  const migration = readFileSync(join(repoRoot, "db/migrations/036_notification_dlq.sql"), "utf8");

  it("forces RLS and does not let the app role satisfy service-only access by role membership", () => {
    expect(migration).toMatch(/ALTER\s+TABLE\s+notification_dlq\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\s*;/i);
    expect(migration).not.toMatch(/pg_has_role\s*\(\s*current_user\s*,\s*'poputchiki_service'\s*,\s*'MEMBER'\s*\)/i);
    expect(migration).toMatch(/current_role\s*=\s*'poputchiki_service'/i);
  });

  it("revokes default app-role table and sequence privileges from the sensitive queue", () => {
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+notification_dlq\s+FROM\s+poputchiki_app\s*;/i);
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+SEQUENCE\s+notification_dlq_id_seq\s+FROM\s+poputchiki_app\s*;/i);
  });
});
