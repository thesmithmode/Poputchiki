/**
 * Integration tests for notifier worker.
 * Requires running PostgreSQL (DATABASE_URL or POSTGRES_* env vars).
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb } from "../../src/db.js";
import type { FetchFn } from "../../src/process-event.js";
import { processEvent } from "../../src/process-event.js";

function buildDsn(): string {
  return (
    process.env.DATABASE_URL_TEST ??
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? 5432}/${process.env.POSTGRES_DB}`
  );
}

describe("notifier integration", () => {
  let sql: postgres.Sql;
  let db: ReturnType<typeof createDb>;
  const BOT_TOKEN = "test_token";
  const createdUsers: string[] = [];

  beforeAll(() => {
    sql = postgres(buildDsn());
    db = createDb(sql);
  });

  afterAll(async () => {
    if (createdUsers.length > 0) {
      await sql`DELETE FROM users WHERE id = ANY(${createdUsers}::uuid[])`;
    }
    await sql.end();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createUser(opts: { notify_disabled?: boolean } = {}): Promise<{
    id: string;
    tg_id: number;
  }> {
    const id = randomUUID();
    const tg_id = Math.floor(Math.random() * 1_000_000_000) + 1;
    await sql`
      INSERT INTO users (id, tg_id, display_name, role, notify_disabled)
      VALUES (${id}, ${tg_id}, ${"Test User"}, ${"user"}, ${opts.notify_disabled ?? false})
    `;
    createdUsers.push(id);
    return { id, tg_id };
  }

  it("sends message when user exists and not disabled", async () => {
    const { id, tg_id } = await createUser();
    const fetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    const cache = new Map<string, number>();

    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: id,
        category: "support_reply",
        message_id: "99",
      }),
      BOT_TOKEN,
    );

    expect(fetchFn).toHaveBeenCalledOnce();
    const [, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.chat_id).toBe(tg_id);
  });

  it("skips when notify_disabled=true in DB", async () => {
    const { id } = await createUser({ notify_disabled: true });
    const fetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    const cache = new Map<string, number>();

    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: id,
        category: "system",
      }),
      BOT_TOKEN,
    );

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("skips when preferences enabled=false", async () => {
    const { id } = await createUser();
    // Insert preference with enabled=false
    await sql`
      INSERT INTO notification_preferences (user_id, category, enabled)
      VALUES (${id}, ${"support_reply"}, false)
    `;
    const fetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    const cache = new Map<string, number>();

    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: id,
        category: "support_reply",
      }),
      BOT_TOKEN,
    );

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("system ignores preferences disabled", async () => {
    const { id } = await createUser();
    await sql`
      INSERT INTO notification_preferences (user_id, category, enabled)
      VALUES (${id}, ${"system"}, false)
    `;
    const fetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    const cache = new Map<string, number>();

    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: id,
        category: "system",
      }),
      BOT_TOKEN,
    );

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("on 403 marks notify_disabled in DB", async () => {
    const { id } = await createUser();
    const fetchFn = vi.fn().mockResolvedValue({ status: 403, ok: false } as Response);
    const cache = new Map<string, number>();

    await processEvent(
      db,
      fetchFn as FetchFn,
      cache,
      JSON.stringify({
        user_id: id,
        category: "like_received",
      }),
      BOT_TOKEN,
    );

    const [row] = await sql<[{ notify_disabled: boolean }]>`
      SELECT notify_disabled FROM users WHERE id = ${id}
    `;
    expect(row?.notify_disabled).toBe(true);
  });

  it("NOTIFY notify_user → worker processes event", async () => {
    const { id, tg_id } = await createUser();
    const received: unknown[] = [];

    // Use a LISTEN connection to verify pg_notify works as expected
    const listenSql = postgres(buildDsn(), { max: 1 });

    const fetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    const cache = new Map<string, number>();

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout waiting for notify")), 5000);

      listenSql
        .listen("notify_user", async (raw) => {
          clearTimeout(timer);
          received.push(raw);
          try {
            await processEvent(db, fetchFn as FetchFn, cache, raw, BOT_TOKEN);
          } finally {
            await listenSql.end();
            resolve();
          }
        })
        .then(async () => {
          // Send the notification
          await sql`SELECT pg_notify('notify_user', ${JSON.stringify({
            user_id: id,
            category: "support_reply",
            message_id: "77",
          })})`;
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });

    expect(received).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.chat_id).toBe(tg_id);
  });

  it("multi-replica dedup: одновременные processEvent → ровно один fetch (TASK-139)", async () => {
    // Симуляция: две replicas notifier'а получили один NOTIFY-event.
    // Каждая processEvent атомарно делает INSERT в notification_log.
    // Только первая (UNIQUE notification_id) шлёт в TG — вторая видит false.
    const { id } = await createUser();
    const fetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true } as Response);

    const payload = JSON.stringify({
      user_id: id,
      category: "system",
    });

    // Изолируем cache per replica (in-process LRU не share между instances).
    const cacheA = new Map<string, number>();
    const cacheB = new Map<string, number>();

    await Promise.all([
      processEvent(db, fetchFn as FetchFn, cacheA, payload, BOT_TOKEN),
      processEvent(db, fetchFn as FetchFn, cacheB, payload, BOT_TOKEN),
    ]);

    // Ровно один fetch — DB-уровень дедуп через notification_log unique constraint.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
