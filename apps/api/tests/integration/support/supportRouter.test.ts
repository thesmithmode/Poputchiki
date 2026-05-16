/**
 * Integration: POST/GET /api/support/messages + admin endpoints
 * Requires: Postgres + all migrations applied.
 */
import { sessBind } from "../../helpers/auth";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createSupportRouter } from "../../../src/support/supportRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-support";

const USER = { id: "00000000-0000-4000-f000-300000000001", tgId: 9600001, role: "user" as const };
const USER_B = { id: "00000000-0000-4000-f000-300000000002", tgId: 9600002, role: "user" as const };
const ADMIN = { id: "00000000-0000-4000-f000-300000000003", tgId: 9600003, role: "admin" as const };

let sql: ReturnType<typeof createPool>;

async function makeToken(u: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: String(u.tgId), uid: u.id, role: u.role, typ: "access", jti: crypto.randomUUID(), iat: now, exp: now + 3600 },
    JWT_SECRET,
  );
}

function makeApp(): Hono {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  const { userRouter, adminRouter } = createSupportRouter(sql);
  app.route("/api/support", userRouter);
  app.route("/api/admin/support", adminRouter);
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name, role)
      VALUES
        (${USER.id}, ${USER.tgId}, 'Support User', 'user'),
        (${USER_B.id}, ${USER_B.tgId}, 'Support UserB', 'user'),
        (${ADMIN.id}, ${ADMIN.tgId}, 'Support Admin', 'admin')
      ON CONFLICT (tg_id) DO NOTHING
    `;
  });
});

afterAll(async () => {
  await sql`DELETE FROM support_messages WHERE user_id IN (${USER.id}, ${USER_B.id}, ${ADMIN.id})`;
  await sql`DELETE FROM users WHERE id IN (${USER.id}, ${USER_B.id}, ${ADMIN.id})`;
  await sql.end();
});

describe("POST /api/support/messages", () => {
  it("201 — user creates ticket", async () => {
    const app = makeApp();
    const token = await makeToken(USER);
    const res = await app.request("/api/support/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "I need help with my account" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.user_id).toBe(USER.id);
    expect(body.text).toBe("I need help with my account");
    expect(body.status).toBe("open");
    expect(body.id).toBeDefined();
  });

  it("422 — empty text", async () => {
    const app = makeApp();
    const token = await makeToken(USER);
    const res = await app.request("/api/support/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "" }),
    });
    expect(res.status).toBe(422);
  });

  it("401 without auth", async () => {
    const app = makeApp();
    const res = await app.request("/api/support/messages", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/support/messages/me", () => {
  it("200 — user sees own messages", async () => {
    const app = makeApp();
    const token = await makeToken(USER);
    const res = await app.request("/api/support/messages/me", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((m: { user_id: string }) => m.user_id === USER.id)).toBe(true);
  });

  it("200 — USER_B sees empty list", async () => {
    const app = makeApp();
    const token = await makeToken(USER_B);
    const res = await app.request("/api/support/messages/me", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.length).toBe(0);
  });
});

describe("GET /api/admin/support/messages", () => {
  it("200 — admin sees all messages", async () => {
    const app = makeApp();
    const token = await makeToken(ADMIN);
    const res = await app.request("/api/admin/support/messages", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it("403 — regular user cannot access admin endpoint", async () => {
    const app = makeApp();
    const token = await makeToken(USER);
    const res = await app.request("/api/admin/support/messages", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/support/messages/:id/reply", () => {
  it("200 — admin replies: reply_text set, status=resolved", async () => {
    // Get first message id
    const msgs = await sql`SELECT id FROM support_messages WHERE user_id = ${USER.id} LIMIT 1`;
    const msgId = msgs[0]?.id as string;

    const app = makeApp();
    const token = await makeToken(ADMIN);
    const res = await app.request(`/api/admin/support/messages/${msgId}/reply`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reply_text: "Your issue has been resolved." }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.reply_text).toBe("Your issue has been resolved.");
    expect(body.status).toBe("resolved");
    expect(body.replied_at).toBeDefined();
  });

  it("403 — regular user cannot reply", async () => {
    const msgs = await sql`SELECT id FROM support_messages WHERE user_id = ${USER.id} LIMIT 1`;
    const msgId = msgs[0]?.id as string;

    const app = makeApp();
    const token = await makeToken(USER);
    const res = await app.request(`/api/admin/support/messages/${msgId}/reply`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reply_text: "Hack" }),
    });
    expect(res.status).toBe(403);
  });
});
