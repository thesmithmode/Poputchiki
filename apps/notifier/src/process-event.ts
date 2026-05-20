import { isNotificationCategory } from "@poputchiki/shared";
import type { CircuitBreaker } from "./circuit-breaker.js";
import { buildDedupKey, checkAndSet } from "./dedup.js";
import { formatMessage } from "./format.js";
import { buildReplyMarkup } from "./reply-markup.js";
import type { Category, NotifierDb, NotifyPayload } from "./types.js";

const isValidCategory = isNotificationCategory as (val: unknown) => val is Category;

export function sanitizeErr(err: unknown, token: string): string {
  /* c8 ignore next -- non-Error branch is defensive; all real errors are Error instances */
  const s = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  /* c8 ignore next -- empty token branch is defensive */
  return token ? s.split(token).join("***") : s;
}

// REL-02: счётчик in-flight 429-retries для observability + защиты от leak
let rateLimitRetriesInFlight = 0;
const MAX_RETRIES_IN_FLIGHT = 100;

export function getRateLimitRetriesInFlight(): number {
  return rateLimitRetriesInFlight;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function processEvent(
  db: NotifierDb,
  fetchFn: FetchFn,
  cache: Map<string, number>,
  raw: string,
  botToken: string,
  circuit?: CircuitBreaker,
): Promise<void> {
  let payload: NotifyPayload;
  try {
    payload = JSON.parse(raw) as NotifyPayload;
  } catch {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_parse_error", raw }));
    return;
  }

  const { user_id, category } = payload;
  if (!user_id || !isValidCategory(category)) {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_invalid_payload", payload }));
    return;
  }

  const key = buildDedupKey(payload);
  if (!checkAndSet(cache, key)) {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_dedup_skip", user_id, category }));
    return;
  }

  const isNew = await db.tryLogNotification(key, user_id, category);
  if (!isNew) {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_dedup_db_skip", user_id, category }));
    return;
  }

  const recipient = await db.getRecipient(user_id, category);
  if (!recipient) {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_user_not_found", user_id }));
    return;
  }

  // Абсолютный stop: бот заблокирован
  if (recipient.notify_disabled) {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_disabled_skip", user_id }));
    return;
  }

  // system игнорирует preferences, но не notify_disabled
  if (category !== "system" && !recipient.pref_enabled) {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_pref_skip", user_id, category }));
    return;
  }

  if (circuit?.isOpen()) {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_circuit_open_skip", user_id, category }));
    await db.updateNotificationStatus(key, "skipped_disabled");
    return;
  }

  const text = formatMessage(category, payload);
  const replyMarkup = buildReplyMarkup(category, payload);
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = JSON.stringify({
    chat_id: recipient.tg_id,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

  let resp: Response;
  try {
    resp = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (err) {
    console.error(
      JSON.stringify({ msg: "notifier_fetch_error", user_id, error: sanitizeErr(err, botToken) }),
    );
    return;
  }

  if (resp.status === 403) {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_bot_blocked", user_id }));
    await db.markNotifyDisabled(user_id);
    // REL-02 (C3): без updateNotificationStatus запись остаётся 'sent' — ложная статистика.
    await db.updateNotificationStatus(key, "failed");
    return;
  }

  if (resp.status === 429) {
    // biome-ignore lint/suspicious/noConsoleLog: structured worker log
    console.log(JSON.stringify({ msg: "notifier_rate_limited", user_id }));
    // REL-02: НЕ блокируем основную очередь sleep(60s). Раньше per-user rate-limit
    // останавливал обработку всех уведомлений — все события за 60s терялись из NOTIFY-payload.
    // Решение: статус 'failed' + fire-and-forget retry через setTimeout без await.
    await db.updateNotificationStatus(key, "failed");
    if (rateLimitRetriesInFlight >= MAX_RETRIES_IN_FLIGHT) {
      console.error(
        JSON.stringify({
          msg: "notifier_retry_skipped_overflow",
          user_id,
          in_flight: rateLimitRetriesInFlight,
        }),
      );
      return;
    }
    rateLimitRetriesInFlight++;
    setTimeout(() => {
      // c8 ignore start -- async retry not deterministically covered by unit tests
      fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json" }, body })
        .then((retry) => {
          if (!retry.ok) {
            console.error(
              JSON.stringify({ msg: "notifier_retry_failed", user_id, status: retry.status }),
            );
          }
        })
        .catch((err: unknown) => {
          console.error(
            JSON.stringify({
              msg: "notifier_retry_error",
              user_id,
              error: sanitizeErr(err, botToken),
            }),
          );
        })
        .finally(() => {
          rateLimitRetriesInFlight = Math.max(0, rateLimitRetriesInFlight - 1);
        });
      // c8 ignore stop
    }, 60_000);
    return;
  }

  if (!resp.ok) {
    console.error(JSON.stringify({ msg: "notifier_send_failed", user_id, status: resp.status }));
    await db.updateNotificationStatus(key, "failed");
    // 5xx → record failure in circuit breaker
    /* c8 ignore next -- circuit may be undefined in tests without circuit breaker */
    if (resp.status >= 500) circuit?.recordFailure();
    return;
  }

  /* c8 ignore next -- circuit?.recordSuccess optional chain: null circuit tested separately */
  circuit?.recordSuccess();
}
