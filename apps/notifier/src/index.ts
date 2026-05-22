import postgres from "postgres";
import { CircuitBreaker } from "./circuit-breaker.js";
import { buildDsn, createDb } from "./db.js";
import { createDlqClient } from "./dlq.js";
import { listenWithBackoff } from "./listen.js";
import { processEvent, sanitizeErr } from "./process-event.js";
import { DLQ_TICK_MS, runRetryTick } from "./retry-loop.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN required");

const dsn = buildDsn();
const sql = postgres(dsn);
const db = createDb(sql);
const dlq = createDlqClient(sql);

const cache = new Map<string, number>();
const circuit = new CircuitBreaker({ failureThreshold: 5, openWindowMs: 30_000 });

function log(msg: string, extra: Record<string, unknown> = {}): void {
  // biome-ignore lint/suspicious/noConsoleLog: structured worker log
  console.log(JSON.stringify({ msg, ...extra }));
}

const handler = async (raw: string) => {
  await processEvent(db, fetch, cache, raw, BOT_TOKEN as string, circuit, dlq).catch(
    (err: unknown) => {
      console.error(
        JSON.stringify({
          msg: "notifier_unhandled",
          error: sanitizeErr(err, BOT_TOKEN as string),
        }),
      );
    },
  );
};

// DLQ retry loop: каждые DLQ_TICK_MS забирает batch failed-уведомлений и пытается заново.
let retryTickRunning = false;
const retryTimer = setInterval(() => {
  if (retryTickRunning) return; // защита от наложения ticks при медленном DB.
  retryTickRunning = true;
  void runRetryTick({ db, dlq, fetchFn: fetch, botToken: BOT_TOKEN as string, circuit, log })
    .catch((err: unknown) => {
      console.error(
        JSON.stringify({
          msg: "notifier_dlq_tick_error",
          error: sanitizeErr(err, BOT_TOKEN as string),
        }),
      );
    })
    .finally(() => {
      retryTickRunning = false;
    });
}, DLQ_TICK_MS);

log("notifier_started");
// Dedicated connection so disconnect doesn't kill main pool
const listenSql = postgres(dsn, { max: 1, onnotice: () => {} });

// H1: graceful shutdown. Docker stop посылает SIGTERM с 10s grace.
// Закрываем пулы → in-flight queries дренируются, новые блокируются.
const shutdown = async (signal: string) => {
  log("notifier_shutdown_start", { signal });
  clearInterval(retryTimer);
  await Promise.allSettled([sql.end({ timeout: 5 }), listenSql.end({ timeout: 5 })]);
  log("notifier_shutdown_done");
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await listenWithBackoff(() => listenSql.listen("notify_user", handler).then(() => {}), {
  onConnected: () => log("notifier_listening"),
  onError: (err, attempt, delayMs) => {
    console.error(
      JSON.stringify({
        msg: "notifier_listen_failed",
        attempt,
        retry_in_ms: delayMs,
        error: sanitizeErr(err, BOT_TOKEN as string),
      }),
    );
  },
});
