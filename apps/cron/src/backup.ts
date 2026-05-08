import type postgres from "postgres";
import { withLock } from "./lib/with-lock.js";

const LOCK_BACKUP = 200001;
const LOCK_BASE_BACKUP = 200002;
const LOCK_RESTORE_TEST = 200003;

type SpawnFn = (cmd: string[]) => Promise<{ exitCode: number }>;
type NotifyFn = (msg: string) => Promise<void>;

export interface BackupOptions {
  _spawn?: SpawnFn;
  _notify?: NotifyFn;
}

export interface BackupResult {
  ok: boolean;
}

/* c8 ignore start -- real spawn/notify only outside tests */
async function defaultSpawn(cmd: string[]): Promise<{ exitCode: number }> {
  const proc = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" });
  const exitCode = await proc.exited;
  return { exitCode };
}

async function defaultNotify(msg: string): Promise<void> {
  const proc = Bun.spawn(["bash", "scripts/notify-admin.sh", msg], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}
/* c8 ignore stop */

async function runScript(
  sql: postgres.Sql,
  lockId: number,
  cmd: string[],
  failMsg: string,
  options: BackupOptions,
): Promise<BackupResult | null> {
  const spawn = options._spawn ?? defaultSpawn;
  const notify = options._notify ?? defaultNotify;

  return withLock(sql, lockId, async () => {
    try {
      const { exitCode } = await spawn(cmd);
      if (exitCode !== 0) {
        await notify(failMsg);
        return { ok: false };
      }
      return { ok: true };
    } catch (err) {
      await notify(`${failMsg}: ${String(err)}`);
      return { ok: false };
    }
  });
}

export function runBackup(
  sql: postgres.Sql,
  options: BackupOptions = {},
): Promise<BackupResult | null> {
  return runScript(sql, LOCK_BACKUP, ["bash", "scripts/backup-db.sh"], "backup-db failed", options);
}

export function runBaseBackup(
  sql: postgres.Sql,
  options: BackupOptions = {},
): Promise<BackupResult | null> {
  return runScript(
    sql,
    LOCK_BASE_BACKUP,
    ["bash", "scripts/backup-db.sh", "--base"],
    "base-backup failed",
    options,
  );
}

export function runRestoreTest(
  sql: postgres.Sql,
  options: BackupOptions = {},
): Promise<BackupResult | null> {
  return runScript(
    sql,
    LOCK_RESTORE_TEST,
    ["bash", "scripts/restore-test.sh"],
    "restore-test failed",
    options,
  );
}
