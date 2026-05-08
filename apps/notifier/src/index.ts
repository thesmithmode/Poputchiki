import postgres from "postgres";
import { CircuitBreaker } from "./circuit-breaker.js";
import { buildDsn, createDb } from "./db.js";
import { listenWithBackoff } from "./listen.js";
import { processEvent, sanitizeErr } from "./process-event.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN required");

const dsn = buildDsn();
const sql = postgres(dsn);
const db = createDb(sql);

const cache = new Map<string, number>();
const circuit = new CircuitBreaker({ failureThreshold: 5, openWindowMs: 30_000 });

function log(msg: string, extra: Record<string, unknown> = {}): void {
  // biome-ignore lint/suspicious/noConsoleLog: structured worker log
  console.log(JSON.stringify({ msg, ...extra }));
}

const handler = async (raw: string) => {
  await processEvent(db, fetch, cache, raw, BOT_TOKEN as string, circuit).catch((err: unknown) => {
    console.error(
      JSON.stringify({
        msg: "notifier_unhandled",
        error: sanitizeErr(err, BOT_TOKEN as string),
      }),
    );
  });
};

log("notifier_started");
// Dedicated connection so disconnect doesn't kill main pool
const listenSql = postgres(dsn, { max: 1, onnotice: () => {} });
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
