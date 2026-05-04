import postgres from "postgres";
import { CircuitBreaker } from "./circuit-breaker.js";
import { buildDsn, createDb } from "./db.js";
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

async function startListener(): Promise<void> {
  // Dedicated connection so disconnect doesn't kill main pool
  const listenSql = postgres(dsn, { max: 1, onnotice: () => {} });
  const handler = async (raw: string) => {
    await processEvent(db, fetch, cache, raw, BOT_TOKEN as string, circuit).catch(
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
  try {
    await listenSql.listen("notify_user", handler);
    log("notifier_listening");
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "notifier_listen_failed",
        error: sanitizeErr(err, BOT_TOKEN as string),
      }),
    );
    await listenSql.end({ timeout: 5 }).catch(() => {});
    const backoffMs = 5_000;
    log("notifier_listen_retry", { in_ms: backoffMs });
    await new Promise((r) => setTimeout(r, backoffMs));
    return startListener();
  }
}

log("notifier_started");
await startListener();
