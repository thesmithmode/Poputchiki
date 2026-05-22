import type { CircuitBreaker } from "./circuit-breaker.js";
import type { DlqClient } from "./dlq.js";
import { formatMessage } from "./format.js";
import type { FetchFn } from "./process-event.js";
import { sanitizeErr } from "./process-event.js";
import { buildReplyMarkup } from "./reply-markup.js";
import type { Category, NotifierDb } from "./types.js";

/**
 * Retry loop: тянет batch из notification_dlq (FOR UPDATE SKIP LOCKED),
 * пытается отправить в TG, успех → DELETE, fail → markRetry (attempts++, backoff).
 *
 * Multi-replica safe: SKIP LOCKED исключает гонку между notifier instances.
 *
 * Запускается setInterval'ом из index.ts. Каждый tick — один batch.
 */

export const DLQ_TICK_MS = 10_000;
export const DLQ_BATCH_SIZE = 50;

export interface RetryDeps {
  db: NotifierDb;
  dlq: DlqClient;
  fetchFn: FetchFn;
  botToken: string;
  circuit?: CircuitBreaker;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export async function runRetryTick(deps: RetryDeps): Promise<{ processed: number }> {
  const { db, dlq, fetchFn, botToken, circuit, log } = deps;

  if (circuit?.isOpen()) {
    log("dlq_tick_circuit_open_skip");
    return { processed: 0 };
  }

  const rows = await dlq.claimBatch(DLQ_BATCH_SIZE);
  if (rows.length === 0) return { processed: 0 };

  let processed = 0;
  for (const row of rows) {
    const userId = row.user_id;
    const category = row.category as Category;
    try {
      const recipient = await db.getRecipient(userId, category);
      if (!recipient || recipient.notify_disabled) {
        // Получатель пропал/отписался — гасим запись чтобы не крутить вечно.
        await dlq.markSuccess(row.id);
        log("dlq_drop_no_recipient", { user_id: userId });
        processed++;
        continue;
      }
      if (category !== "system" && !recipient.pref_enabled) {
        await dlq.markSuccess(row.id);
        log("dlq_drop_pref_off", { user_id: userId, category });
        processed++;
        continue;
      }

      const text = formatMessage(category, row.payload);
      const replyMarkup = buildReplyMarkup(category, row.payload);
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
        const errMsg = sanitizeErr(err, botToken);
        log("dlq_retry_fetch_error", { user_id: userId, error: errMsg });
        await dlq.markRetry(row.id, null, errMsg);
        processed++;
        continue;
      }

      if (resp.ok) {
        await dlq.markSuccess(row.id);
        circuit?.recordSuccess();
        log("dlq_retry_success", { user_id: userId, category });
      } else if (resp.status === 403) {
        // Bot blocked — финальное состояние, не повторяем.
        await db.markNotifyDisabled(userId);
        await dlq.markSuccess(row.id);
        log("dlq_retry_bot_blocked", { user_id: userId });
      } else {
        await dlq.markRetry(row.id, resp.status, `tg_${resp.status}`);
        if (resp.status >= 500) circuit?.recordFailure();
        log("dlq_retry_failed", { user_id: userId, status: resp.status });
      }
      processed++;
    } catch (err) {
      log("dlq_tick_unhandled", { user_id: userId, error: sanitizeErr(err, botToken) });
      // Не маркируем — следующий tick подхватит (если row.next_retry_at <= now).
      // Но мы держим строку залоченной только до конца транзакции claimBatch,
      // которая уже закрыта — так что строка снова видна.
    }
  }

  return { processed };
}
