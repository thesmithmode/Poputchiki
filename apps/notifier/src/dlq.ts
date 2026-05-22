import type postgres from "postgres";
import type { NotifyPayload } from "./types.js";

/**
 * Notification DLQ — persistent retry queue с exponential backoff.
 *
 * Backoff: 30s × 2^(attempts-1), cap 1h.
 * MAX_ATTEMPTS = 8 → total ~2h до 'dead'.
 *
 * Дедуп по dedup_key (UNIQUE partial index WHERE status='pending'):
 * повторный enqueue одного и того же события не создаёт дубликат, обновляет
 * last_error / last_status и сбрасывает attempts++ + next_retry_at.
 *
 * Multi-replica safe: claimBatch использует FOR UPDATE SKIP LOCKED.
 */

export const MAX_ATTEMPTS = 8;
export const BASE_BACKOFF_MS = 30_000;
export const MAX_BACKOFF_MS = 3_600_000;

export function backoffMs(attempts: number): number {
  const ms = BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(ms, MAX_BACKOFF_MS);
}

export interface DlqRow {
  id: string | number;
  dedup_key: string;
  user_id: string;
  category: string;
  payload: NotifyPayload;
  attempts: number;
  last_status: number | null;
}

export interface DlqClient {
  enqueue(args: {
    dedupKey: string;
    userId: string;
    category: string;
    payload: NotifyPayload;
    lastStatus: number | null;
    lastError: string;
  }): Promise<void>;
  claimBatch(limit: number): Promise<DlqRow[]>;
  markSuccess(id: string | number): Promise<void>;
  markRetry(id: string | number, lastStatus: number | null, lastError: string): Promise<void>;
}

/* c8 ignore start -- SQL layer; covered by integration tests only */
export function createDlqClient(sql: postgres.Sql): DlqClient {
  return {
    async enqueue(args) {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_service`;
        // Дедуп: при повторе того же dedup_key — bump attempts (но не сбрасывать total).
        await tx`
          INSERT INTO notification_dlq (
            dedup_key, user_id, category, payload, attempts,
            last_status, last_error, next_retry_at
          )
          VALUES (
            ${args.dedupKey},
            ${args.userId}::uuid,
            ${args.category},
            ${sql.json(args.payload as Parameters<typeof sql.json>[0])}::jsonb,
            1,
            ${args.lastStatus},
            ${args.lastError},
            NOW() + (${backoffMs(1)} || ' milliseconds')::interval
          )
          ON CONFLICT (dedup_key) WHERE status = 'pending'
          DO UPDATE SET
            attempts = notification_dlq.attempts + 1,
            last_status = EXCLUDED.last_status,
            last_error = EXCLUDED.last_error,
            next_retry_at = NOW() + (
              LEAST(
                ${MAX_BACKOFF_MS},
                ${BASE_BACKOFF_MS} * (2 ^ notification_dlq.attempts)::int
              ) || ' milliseconds'
            )::interval
        `;
      });
    },

    async claimBatch(limit) {
      // Lease pattern: SELECT FOR UPDATE SKIP LOCKED + сразу UPDATE next_retry_at в будущее.
      // Так после COMMIT строки невидимы для других replicas в течение lease окна,
      // даже без удержания tx-lock на время fetch (который бы блокировал DB connection).
      const LEASE_MS = 30_000;
      return sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_service`;
        return tx<DlqRow[]>`
          WITH claimed AS (
            SELECT id
            FROM notification_dlq
            WHERE status = 'pending' AND next_retry_at <= NOW()
            ORDER BY next_retry_at
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          UPDATE notification_dlq d
          SET next_retry_at = NOW() + (${LEASE_MS} || ' milliseconds')::interval
          FROM claimed
          WHERE d.id = claimed.id
          RETURNING d.id, d.dedup_key, d.user_id::text AS user_id, d.category,
                    d.payload, d.attempts, d.last_status
        `;
      });
    },

    async markSuccess(id) {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_service`;
        await tx`DELETE FROM notification_dlq WHERE id = ${id}`;
      });
    },

    async markRetry(id, lastStatus, lastError) {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_service`;
        // attempts уже инкрементировался при enqueue; здесь bump на следующую попытку.
        await tx`
          UPDATE notification_dlq
          SET
            attempts = attempts + 1,
            last_status = ${lastStatus},
            last_error = ${lastError},
            next_retry_at = CASE
              WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN next_retry_at
              ELSE NOW() + (
                LEAST(
                  ${MAX_BACKOFF_MS},
                  ${BASE_BACKOFF_MS} * (2 ^ attempts)::int
                ) || ' milliseconds'
              )::interval
            END,
            status = CASE
              WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'dead'
              ELSE status
            END
          WHERE id = ${id}
        `;
      });
    },
  };
}
/* c8 ignore stop */
