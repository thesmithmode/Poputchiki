import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DlqClient } from "../../src/dlq.js";
import type { FetchFn } from "../../src/process-event.js";
import { getRateLimitRetriesInFlight, processEvent } from "../../src/process-event.js";
import type { NotifierDb, Recipient } from "../../src/types.js";

const BOT_TOKEN = "test_token";

function makeDb(overrides: Partial<NotifierDb> = {}): NotifierDb {
  return {
    getRecipient: vi.fn().mockResolvedValue({
      tg_id: 123456,
      notify_disabled: false,
      pref_enabled: true,
    } satisfies Recipient),
    markNotifyDisabled: vi.fn().mockResolvedValue(undefined),
    tryLogNotification: vi.fn().mockResolvedValue(true),
    updateNotificationStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeFetch(status = 200, ok = true) {
  return vi.fn().mockResolvedValue({ status, ok } as Response);
}

describe("processEvent", () => {
  let cache: Map<string, number>;

  beforeEach(() => {
    cache = new Map();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends message for valid support_reply payload", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(200, true);
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "support_reply",
        message_id: "10",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(BOT_TOKEN);
    expect(url).toContain("sendMessage");
    const body = JSON.parse(opts.body as string);
    expect(body.chat_id).toBe(123456);
    expect(body.text).toContain("#10");
    expect(body.parse_mode).toBe("HTML");
  });

  it("ride_request with request_id → sendMessage body includes reply_markup", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(200, true);
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "ride_request",
        request_id: "req-42",
        ride_id: "ride-7",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    const [, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.reply_markup).toBeDefined();
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("req:accept:req-42");
    expect(body.reply_markup.inline_keyboard[0][1].callback_data).toBe("req:reject:req-42");
  });

  it("ride_request without request_id → no reply_markup in body", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(200, true);
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "ride_request",
        ride_id: "ride-7",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    const [, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.reply_markup).toBeUndefined();
  });

  it("like_received → no reply_markup (только текст)", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(200, true);
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({ user_id: "u1", category: "like_received" }),
      BOT_TOKEN,
    );
    const [, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.reply_markup).toBeUndefined();
  });

  it("skips when notify_disabled=true", async () => {
    const db = makeDb({
      getRecipient: vi.fn().mockResolvedValue({
        tg_id: 1,
        notify_disabled: true,
        pref_enabled: true,
      }),
    });
    const fetchFn = makeFetch();
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "support_reply",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("skips when pref_enabled=false and category != system", async () => {
    const db = makeDb({
      getRecipient: vi.fn().mockResolvedValue({
        tg_id: 1,
        notify_disabled: false,
        pref_enabled: false,
      }),
    });
    const fetchFn = makeFetch();
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "ride_request",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does NOT skip system category even if pref_enabled=false", async () => {
    const db = makeDb({
      getRecipient: vi.fn().mockResolvedValue({
        tg_id: 1,
        notify_disabled: false,
        pref_enabled: false,
      }),
    });
    const fetchFn = makeFetch(200, true);
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "system",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("skips system category when notify_disabled=true", async () => {
    const db = makeDb({
      getRecipient: vi.fn().mockResolvedValue({
        tg_id: 1,
        notify_disabled: true,
        pref_enabled: false,
      }),
    });
    const fetchFn = makeFetch();
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "system",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("on HTTP 403 marks notify_disabled", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(403, false);
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "like_received",
      }),
      BOT_TOKEN,
    );
    expect(db.markNotifyDisabled).toHaveBeenCalledWith("u1");
  });

  it("on HTTP 429 sleeps 60s and retries", async () => {
    vi.useFakeTimers();
    const db = makeDb();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, ok: false } as Response)
      .mockResolvedValueOnce({ status: 200, ok: true } as Response);

    const promise = processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "review_received",
      }),
      BOT_TOKEN,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;
    expect(fetchFn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("dedup: second identical event within 5 min is skipped", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(200, true);
    const raw = JSON.stringify({ user_id: "u1", category: "like_received", target_id: "x" });
    await processEvent(db, fetchFn as FetchFn, cache, raw, BOT_TOKEN);
    await processEvent(db, fetchFn as FetchFn, cache, raw, BOT_TOKEN);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("dedup: after 5 min window sends again", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(200, true);
    const raw = JSON.stringify({ user_id: "u1", category: "like_received", target_id: "y" });

    // First event
    await processEvent(db, fetchFn as FetchFn, cache, raw, BOT_TOKEN);

    // Manually expire the cache entry
    for (const [k] of cache) {
      cache.set(k, Date.now() - 1);
    }

    // Second event after expiry
    await processEvent(db, fetchFn as FetchFn, cache, raw, BOT_TOKEN);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("returns early on invalid JSON", async () => {
    const db = makeDb();
    const fetchFn = makeFetch();
    await processEvent(db, fetchFn as FetchFn, cache, "not-json", BOT_TOKEN);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns early when user_id missing", async () => {
    const db = makeDb();
    const fetchFn = makeFetch();
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        category: "system",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("accepts ride_changed (canonical NOTIFICATION_CATEGORIES) and sends message", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(200, true);
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "ride_changed",
        ride_id: "r1",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("accepts admin_review_cancellation_abuse (admin category) and sends message", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(200, true);
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "admin",
        category: "admin_review_cancellation_abuse",
        ride_id: "r1",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("returns early when category invalid", async () => {
    const db = makeDb();
    const fetchFn = makeFetch();
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "unknown_cat",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns early when user not found in DB", async () => {
    const db = makeDb({
      getRecipient: vi.fn().mockResolvedValue(null),
    });
    const fetchFn = makeFetch();
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u_missing",
        category: "system",
      }),
      BOT_TOKEN,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("handles non-ok non-403 non-429 response without throwing", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(500, false);
    await expect(
      processEvent(
        db,
        fetchFn as FetchFn,
        cache,
        JSON.stringify({
          user_id: "u1",
          category: "system",
        }),
        BOT_TOKEN,
      ),
    ).resolves.toBeUndefined();
  });

  it("handles fetch network error without throwing", async () => {
    const db = makeDb();
    const fetchFn = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(
      processEvent(
        db,
        fetchFn as FetchFn,
        cache,
        JSON.stringify({
          user_id: "u1",
          category: "system",
        }),
        BOT_TOKEN,
      ),
    ).resolves.toBeUndefined();
  });

  it("handles 429 retry fetch error gracefully", async () => {
    vi.useFakeTimers();
    const db = makeDb();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, ok: false } as Response)
      .mockRejectedValueOnce(new Error("retry failed"));

    const promise = processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "review_received",
      }),
      BOT_TOKEN,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("handles 429 retry non-ok response", async () => {
    vi.useFakeTimers();
    const db = makeDb();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, ok: false } as Response)
      .mockResolvedValueOnce({ status: 500, ok: false } as Response);

    const promise = processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: "u1",
        category: "review_received",
      }),
      BOT_TOKEN,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("sends messages for all known categories", async () => {
    const categories = [
      "ride_request",
      "ride_cancelled",
      "confirm_participation",
      "participation_request",
      "like_received",
      "review_received",
      "favorite_new_ride",
      "system",
    ] as const;

    for (const category of categories) {
      const localCache = new Map<string, number>();
      const db = makeDb();
      const fetchFn = makeFetch(200, true);
      await processEvent(
        db,
        fetchFn as FetchFn,
        localCache,
        JSON.stringify({
          user_id: "u1",
          category,
          target_id: `target-${category}`,
        }),
        BOT_TOKEN,
      );
      expect(fetchFn).toHaveBeenCalledOnce();
    }
  });

  it("skips when tryLogNotification returns false (db-level dedup)", async () => {
    const db = makeDb({ tryLogNotification: vi.fn().mockResolvedValue(false) });
    const fetchFn = makeFetch(200, true);
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({ user_id: "u1", category: "like_received", target_id: "t1" }),
      BOT_TOKEN,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("getRateLimitRetriesInFlight returns number", () => {
    expect(typeof getRateLimitRetriesInFlight()).toBe("number");
  });

  it("5xx with DLQ → dlq.enqueue called with correct args", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(500, false);
    const dlq: DlqClient = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      claimBatch: vi.fn(),
      markSuccess: vi.fn(),
      markRetry: vi.fn(),
    };
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({ user_id: "u1", category: "system" }),
      BOT_TOKEN,
      undefined,
      dlq,
    );
    expect(dlq.enqueue).toHaveBeenCalledOnce();
    const arg = (dlq.enqueue as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.lastStatus).toBe(500);
    expect(arg.userId).toBe("u1");
  });

  it("5xx with DLQ enqueue failing → caught gracefully, no throw", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(503, false);
    const dlq: DlqClient = {
      enqueue: vi.fn().mockRejectedValue(new Error("db down")),
      claimBatch: vi.fn(),
      markSuccess: vi.fn(),
      markRetry: vi.fn(),
    };
    await expect(
      processEvent(
        db,
        fetchFn as FetchFn,
        cache,
        JSON.stringify({ user_id: "u1", category: "system" }),
        BOT_TOKEN,
        undefined,
        dlq,
      ),
    ).resolves.toBeUndefined();
  });

  it("skips and marks skipped_disabled when circuit breaker is open", async () => {
    const db = makeDb();
    const fetchFn = makeFetch(200, true);
    const circuit = {
      isOpen: () => true,
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    } as unknown as import("../../src/circuit-breaker.js").CircuitBreaker;
    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({ user_id: "u1", category: "like_received", target_id: "t1" }),
      BOT_TOKEN,
      circuit,
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(db.updateNotificationStatus).toHaveBeenCalledWith(
      expect.any(String),
      "skipped_disabled",
    );
  });
});
