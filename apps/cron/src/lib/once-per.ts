import type postgres from "postgres";

/**
 * REL-04: персистентный dedup hour/day-gated cron-задач.
 * Запускает fn() только если с последнего успешного запуска прошло ≥ minIntervalMs.
 * Без этой защиты рестарт cron в час X (rolling deploy, crash-loop) дублирует backup,
 * base-backup, restore-test, expand_templates.
 *
 * Pattern: claim-then-run в одной транзакции через INSERT ... ON CONFLICT DO UPDATE
 * с WHERE-guard на last_run_at. RLS escalation до poputchiki_service.
 *
 * Возвращает true если задача запустилась, false если skipped (recent run).
 */
export async function oncePer(
  sql: postgres.Sql,
  jobName: string,
  minIntervalMs: number,
  fn: () => Promise<unknown>,
): Promise<boolean> {
  const claimed = await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_service`;
    const intervalSec = Math.floor(minIntervalMs / 1000);
    const rows = await tx<{ job_name: string }[]>`
      INSERT INTO cron_state (job_name, last_run_at)
      VALUES (${jobName}, now())
      ON CONFLICT (job_name) DO UPDATE
        SET last_run_at = now()
        WHERE cron_state.last_run_at < now() - make_interval(secs => ${intervalSec})
      RETURNING job_name
    `;
    return rows.length > 0;
  });
  if (!claimed) return false;
  await fn();
  return true;
}
