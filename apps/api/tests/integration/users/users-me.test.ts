/**
 * Integration: GET /api/users/me + GET /api/users/:id
 * Requires: Postgres + migrations 000-010 applied.
 */
import { sessBind } from "../../helpers/auth";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createUsersRouter } from "../../../src/users/usersRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-users-me-integration";

const ME = { id: "00000000-0000-4000-d000-200000000001", tgId: 7100001, role: "user" as const };
const OTHER = {
  id: "00000000-0000-4000-d000-200000000002",
  tgId: 7100002,
  role: "user" as const,
};
const BANNED = {
  id: "00000000-0000-4000-d000-200000000003",
  tgId: 7100003,
  role: "user" as const,
};

let sql: ReturnType<typeof createPool>;

async function makeToken(u: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: String(u.tgId), uid: u.id, role: u.role, typ: "access", jti: crypto.randomUUID(), iat: now, exp: now + 3600 },
    JWT_SECRET,
  );
}

function makeApp() {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/users", createUsersRouter(sql));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, tg_username, display_name, avatar_url, role, onboarded, notify_disabled, phone_enc, apt_number_enc)
      VALUES
        (${ME.id}, ${ME.tgId}, 'me_user', 'Me User', 'https://t.me/i/me.jpg', 'user', true, false, decode('aabb','hex'), decode('ccdd','hex')),
        (${OTHER.id}, ${OTHER.tgId}, 'other_user', 'Other User', NULL, 'user', true, false, NULL, NULL),
        (${BANNED.id}, ${BANNED.tgId}, 'banned_user', 'Banned User', NULL, 'user', true, false, NULL, NULL)
      ON CONFLICT (tg_id) DO UPDATE SET display_name = EXCLUDED.display_name
    `;
    await tx`UPDATE users SET is_banned = true, banned_at = NOW() WHERE id = ${BANNED.id}`;
  });
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id IN (${ME.id}, ${OTHER.id}, ${BANNED.id})`;
  await sql.end();
});

describe("GET /api/users/me", () => {
  it("returns own profile with stats and Cache-Control private,no-store", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/me", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await readJson(res);
    expect(body.id).toBe(ME.id);
    expect(body.tg_id).toBe(ME.tgId);
    expect(body.tg_username).toBe("me_user");
    expect(body.display_name).toBe("Me User");
    expect(body.avatar_url).toBe("https://t.me/i/me.jpg");
    expect(body.role).toBe("user");
    expect(body.onboarded).toBe(true);
    expect(body.notify_disabled).toBe(false);
    expect(typeof body.created_at).toBe("string");
    expect(typeof body.last_seen_at).toBe("string");
    expect(body.stats).toEqual({
      rides_as_driver_completed: 0,
      rides_as_passenger: 0,
      likes_received: 0,
      avg_stars: null,
      reviews_count: 0,
      driver_avg_stars: null,
      passenger_avg_stars: null,
      driver_reviews_count: 0,
      passenger_reviews_count: 0,
    });
  });

  it("never exposes phone_enc / apt_number_enc", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/me", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    const body = await readJson(res);
    expect(body).not.toHaveProperty("phone_enc");
    expect(body).not.toHaveProperty("apt_number_enc");
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("apt_number");
    expect(JSON.stringify(body)).not.toContain("aabb");
    expect(JSON.stringify(body)).not.toContain("ccdd");
  });

  it("401 without Authorization header", async () => {
    const app = makeApp();
    const res = await app.request("/api/users/me");
    expect(res.status).toBe(401);
  });

  it("returns is_banned=true and ban fields when user is banned", async () => {
    const app = makeApp();
    const token = await makeToken(BANNED);
    const res = await app.request("/api/users/me", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.is_banned).toBe(true);
    expect(body).toHaveProperty("ban_reason");
    expect(body).toHaveProperty("banned_at");
  });
});

describe("PATCH /api/users/me", () => {
  it("200 on invalid JSON body (fallback to empty patch)", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: "not-valid-json{{{",
    });
    expect(res.status).toBe(200);
  });

  it("updates apt_number and returns updated profile", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apt_number: "42A" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.id).toBe(ME.id);
  });

  it("200 когда PGCRYPTO_KEY не задан (fallback на пустую строку)", async () => {
    const saved = process.env.PGCRYPTO_KEY;
    process.env.PGCRYPTO_KEY = undefined;
    try {
      const app = makeApp();
      const token = await makeToken(ME);
      const res = await app.request("/api/users/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ display_name: "Updated Name" }),
      });
      expect(res.status).toBe(200);
    } finally {
      if (saved !== undefined) process.env.PGCRYPTO_KEY = saved;
    }
  });
});

describe("GET /api/users/:id", () => {
  it("returns public profile of other user without onboarded/notify/last_seen", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request(`/api/users/${OTHER.id}`, {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await readJson(res);
    expect(body.id).toBe(OTHER.id);
    expect(body.display_name).toBe("Other User");
    expect(body.tg_username).toBe("other_user");
    expect(body).not.toHaveProperty("tg_id");
    expect(body).not.toHaveProperty("role");
    expect(body).not.toHaveProperty("onboarded");
    expect(body).not.toHaveProperty("notify_disabled");
    expect(body).not.toHaveProperty("last_seen_at");
    expect(body).not.toHaveProperty("phone_enc");
    expect(body.stats).toBeDefined();
  });

  it("400 on invalid uuid", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/not-a-uuid", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(400);
  });

  it("404 for banned user", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request(`/api/users/${BANNED.id}`, {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(404);
  });

  it("404 for non-existent uuid", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/00000000-0000-4000-d000-2deadbeef000", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` },
    });
    expect(res.status).toBe(404);
  });
});
