import { describe, expect, it, vi } from "vitest";
import type { CircuitBreaker } from "../../src/circuit-breaker.js";
import type { DlqClient, DlqRow } from "../../src/dlq.js";
import type { FetchFn } from "../../src/process-event.js";
import { runRetryTick } from "../../src/retry-loop.js";
import type { NotifierDb, Recipient } from "../../src/types.js";

const BOT_TOKEN = "test_token";

function makeRow(over: Partial<DlqRow> = {}): DlqRow {
  return {
    id: 1,
    dedup_key: "k1",
    user_id: "u1",
    category: "ride_request",
    payload: { user_id: "u1", category: "ride_request", request_id: "r-1", ride_id: "ride-1" },
    attempts: 1,
    last_status: 429,
    ...over,
  };
}

function makeDb(over: Partial<NotifierDb> = {}): NotifierDb {
  return {
    getRecipient: vi.fn().mockResolvedValue({
      tg_id: 123,
      notify_disabled: false,
      pref_enabled: true,
    } satisfies Recipient),
    markNotifyDisabled: vi.fn().mockResolvedValue(undefined),
    tryLogNotification: vi.fn().mockResolvedValue(true),
    updateNotificationStatus: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function makeDlq(rows: DlqRow[]): DlqClient {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    claimBatch: vi.fn().mockResolvedValue(rows),
    markSuccess: vi.fn().mockResolvedValue(undefined),
    markRetry: vi.fn().mockResolvedValue(undefined),
  };
}

const log = vi.fn();

describe("runRetryTick", () => {
  it("пустой batch → processed=0, fetch не зовётся", async () => {
    const dlq = makeDlq([]);
    const fetchFn = vi.fn() as unknown as FetchFn;
    const res = await runRetryTick({ db: makeDb(), dlq, fetchFn, botToken: BOT_TOKEN, log });
    expect(res.processed).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("успешный send → markSuccess, markRetry не зовётся", async () => {
    const dlq = makeDlq([makeRow()]);
    const fetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    await runRetryTick({
      db: makeDb(),
      dlq,
      fetchFn: fetchFn as unknown as FetchFn,
      botToken: BOT_TOKEN,
      log,
    });
    expect(dlq.markSuccess).toHaveBeenCalledWith(1);
    expect(dlq.markRetry).not.toHaveBeenCalled();
  });

  it("5xx → markRetry с last_status=500", async () => {
    const dlq = makeDlq([makeRow()]);
    const fetchFn = vi.fn().mockResolvedValue({ status: 500, ok: false } as Response);
    await runRetryTick({
      db: makeDb(),
      dlq,
      fetchFn: fetchFn as unknown as FetchFn,
      botToken: BOT_TOKEN,
      log,
    });
    expect(dlq.markRetry).toHaveBeenCalledWith(1, 500, "tg_500");
    expect(dlq.markSuccess).not.toHaveBeenCalled();
  });

  it("403 (бот заблокирован) → markNotifyDisabled + markSuccess (финальное состояние)", async () => {
    const db = makeDb();
    const dlq = makeDlq([makeRow()]);
    const fetchFn = vi.fn().mockResolvedValue({ status: 403, ok: false } as Response);
    await runRetryTick({
      db,
      dlq,
      fetchFn: fetchFn as unknown as FetchFn,
      botToken: BOT_TOKEN,
      log,
    });
    expect(db.markNotifyDisabled).toHaveBeenCalledWith("u1");
    expect(dlq.markSuccess).toHaveBeenCalled();
    expect(dlq.markRetry).not.toHaveBeenCalled();
  });

  it("network error в fetch → markRetry с last_status=null", async () => {
    const dlq = makeDlq([makeRow()]);
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await runRetryTick({
      db: makeDb(),
      dlq,
      fetchFn: fetchFn as unknown as FetchFn,
      botToken: BOT_TOKEN,
      log,
    });
    expect(dlq.markRetry).toHaveBeenCalledWith(1, null, expect.stringContaining("ECONNRESET"));
  });

  it("получатель не найден → markSuccess (drop, не крутим вечно)", async () => {
    const db = makeDb({ getRecipient: vi.fn().mockResolvedValue(null) });
    const dlq = makeDlq([makeRow()]);
    const fetchFn = vi.fn() as unknown as FetchFn;
    await runRetryTick({ db, dlq, fetchFn, botToken: BOT_TOKEN, log });
    expect(dlq.markSuccess).toHaveBeenCalledWith(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("notify_disabled → markSuccess (drop, не пытаемся)", async () => {
    const db = makeDb({
      getRecipient: vi
        .fn()
        .mockResolvedValue({ tg_id: 1, notify_disabled: true, pref_enabled: true }),
    });
    const dlq = makeDlq([makeRow()]);
    const fetchFn = vi.fn() as unknown as FetchFn;
    await runRetryTick({ db, dlq, fetchFn, botToken: BOT_TOKEN, log });
    expect(dlq.markSuccess).toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("pref disabled для не-system → markSuccess (drop)", async () => {
    const db = makeDb({
      getRecipient: vi
        .fn()
        .mockResolvedValue({ tg_id: 1, notify_disabled: false, pref_enabled: false }),
    });
    const dlq = makeDlq([makeRow({ category: "like_received" })]);
    const fetchFn = vi.fn() as unknown as FetchFn;
    await runRetryTick({ db, dlq, fetchFn, botToken: BOT_TOKEN, log });
    expect(dlq.markSuccess).toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("db.getRecipient throws → outer catch logs dlq_tick_unhandled, processed=0", async () => {
    const db = makeDb({ getRecipient: vi.fn().mockRejectedValue(new Error("db error")) });
    const dlq = makeDlq([makeRow()]);
    const fetchFn = vi.fn() as unknown as FetchFn;
    const res = await runRetryTick({ db, dlq, fetchFn, botToken: BOT_TOKEN, log });
    expect(res.processed).toBe(0);
    expect(log).toHaveBeenCalledWith(
      "dlq_tick_unhandled",
      expect.objectContaining({ user_id: "u1" }),
    );
  });

  it("circuit open → skip всего tick, claimBatch не зовётся", async () => {
    const dlq = makeDlq([makeRow()]);
    const fetchFn = vi.fn() as unknown as FetchFn;
    const circuit = {
      isOpen: () => true,
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
    } as unknown as CircuitBreaker;
    await runRetryTick({
      db: makeDb(),
      dlq,
      fetchFn,
      botToken: BOT_TOKEN,
      circuit,
      log,
    });
    expect(dlq.claimBatch).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
