import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backupDb = readFileSync("scripts/backup-db.sh", "utf8");
const restoreTest = readFileSync("scripts/restore-test.sh", "utf8");

describe("backup shell scripts secret handling", () => {
  it("does not pass the backup passphrase in gpg argv", () => {
    expect(backupDb).not.toContain('--passphrase "$BACKUP_KEY"');
    expect(restoreTest).not.toContain('--passphrase "$BACKUP_KEY"');
    expect(backupDb).toContain("--passphrase-fd");
    expect(restoreTest).toContain("--passphrase-fd");
  });

  it("does not pass DATABASE_URL-derived connection strings in PostgreSQL client argv", () => {
    expect(backupDb).not.toContain('pg_dump "$DATABASE_URL"');
    expect(restoreTest).not.toContain('psql "$POSTGRES_URL"');
    expect(restoreTest).not.toContain('pg_restore -d "$RESTORE_URL"');
    expect(restoreTest).not.toContain('psql "$RESTORE_URL"');
    expect(backupDb).toContain("PGPASSFILE");
    expect(restoreTest).toContain("PGPASSFILE");
    expect(backupDb).not.toContain("process.argv[1]");
    expect(restoreTest).not.toContain("process.argv[1]");
  });
});
