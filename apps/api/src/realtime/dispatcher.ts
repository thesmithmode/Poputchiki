/**
 * Single-connection broadcast dispatcher for Postgres LISTEN/NOTIFY.
 *
 * One connection is established per dispatcher instance (one per api process).
 * All SSE streams subscribe to it — no per-client LISTEN calls.
 */
import type postgres from "postgres";
import { poolMetrics } from "../db/pool";
import { listenWithBackoff } from "./listen";

export type NotifyCallback = (payload: string) => void;

export interface Dispatcher {
  /** Register a callback. Returns an unsubscribe function. */
  subscribe(cb: NotifyCallback): () => void;
  /** Number of active subscribers (exposed for metrics/testing). */
  subscriberCount(): number;
}

/**
 * Creates and starts a dispatcher backed by a dedicated listen connection.
 * The LISTEN call is established once; all subscribe/unsubscribe operations
 * only update an in-memory Set of callbacks.
 *
 * Reconnect behaviour: postgres-js sql.listen() создаёт внутренний sub-pool
 * с onclose callback, который автоматически переподписывается на все каналы
 * при потере соединения. listenWithBackoff обеспечивает retry при первоначальном
 * подключении. После успешного listen — реконнект берёт на себя postgres-js.
 *
 * @param listenSql - A postgres.Sql instance dedicated to LISTEN (max:1).
 * @param channel   - The Postgres notification channel to listen on.
 */
export async function createDispatcher(
  listenSql: postgres.Sql,
  channel: string,
): Promise<Dispatcher> {
  const callbacks = new Set<NotifyCallback>();

  await listenWithBackoff(async () => {
    await listenSql.listen(channel, (payload) => {
      /* c8 ignore next -- fires at runtime via pg_notify, not in unit tests */
      for (const cb of callbacks) {
        cb(payload);
      }
    });
  });

  return {
    subscribe(cb: NotifyCallback): () => void {
      callbacks.add(cb);
      poolMetrics.incSseSubscribers();
      return () => {
        callbacks.delete(cb);
        poolMetrics.decSseSubscribers();
      };
    },
    subscriberCount(): number {
      return callbacks.size;
    },
  };
}
