import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");

function readMigration(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("service-only RLS policies", () => {
  it("requires the active poputchiki_service role for user_notifications deletes", () => {
    const sql = readMigration("db/migrations/035_user_notifications_service_delete.sql");

    expect(sql).toContain("CREATE POLICY notif_service_delete ON user_notifications");
    expect(sql).toContain("current_role = 'poputchiki_service'");
    expect(sql).not.toContain("pg_has_role(current_user, 'poputchiki_service', 'MEMBER')");
  });

  it("requires the active poputchiki_service role for notification DLQ access", () => {
    const sql = readMigration("db/migrations/036_notification_dlq.sql");

    expect(sql).toContain("CREATE POLICY dlq_service_all ON notification_dlq");
    expect(sql).toContain("USING (current_role = 'poputchiki_service')");
    expect(sql).toContain("WITH CHECK (current_role = 'poputchiki_service')");
    expect(sql).not.toContain("pg_has_role(current_user, 'poputchiki_service', 'MEMBER')");
  });
});
