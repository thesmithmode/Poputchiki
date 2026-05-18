import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createNotificationsRouter } from "../../../src/notifications/notificationsRouter";
/**
 * Integration: GET/PUT /api/notifications/preferences
 * Requires: Postgres + all migrations applied.
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-notif-prefs";

const USER = { id: "00000000-0000-4000-f000-100000000001", tgId: 9400001, role: "user" as const };

let sql: ReturnType<typeof createPool>;

async function makeToken(u: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(u.tgId),
      uid: u.id,
      role: u.role,
      typ: "access",
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
}

function makeApp(): Hono {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/notifications", createNotificationsRouter(sql));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES (${USER.id}, ${USER.tgId}, 'NotifPrefs User')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    // Ensure clean state
    await tx`DELETE FROM notification_preferences WHERE user_id = ${USER.id}`;
  });
});

afterAll(async () => {
  await sql`DELETE FROM notification_preferences WHERE user_id = ${USER.id}`;
  await sql`DELETE FROM users WHERE id = ${USER.id}`;
  await sql.end();
});

const ALL_CATEGORIES = [
  "ride_request",
  "ride_request_accepted",
  "ride_request_rejected",
  "ride_request_cancelled",
  "ride_cancelled",
  "confirm_participation",
  "participation_request",
  "like_received",
  "review_received",
  "favorite_new_ride",
  "support_reply",
  "system",
];

describe("GET /api/notifications/preferences", () => {
  it("first call returns all 12 categories with enabled=true (defaults)", async () => {
    const app = makeApp();
    const token = await makeToken(USER);
    const res = await app.request("/api/notifications/preferences", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(typeof body).toBe("object");
    for (const cat of ALL_CATEGORIES) {
      expect(body).toHaveProperty(cat);
      expect(body[cat]).toBe(true);
    }
  });

  it("401 without auth", async () => {
    const app = makeApp();
    const res = await app.request("/api/notifications/preferences");
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/notifications/preferences", () => {
  it("disables ride_request category", async () => {
    const app = makeApp();
    const token = await makeToken(USER);
    const res = await app.request("/api/notifications/preferences", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ride_request: false }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ride_request).toBe(false);
    expect(body.like_received).toBe(true); // unchanged
  });

  it("system=false → 422 (system cannot be disabled)", async () => {
    const app = makeApp();
    const token = await makeToken(USER);
    const res = await app.request("/api/notifications/preferences", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ system: false }),
    });
    expect(res.status).toBe(422);
  });

  it("unknown category is ignored (extra keys stripped)", async () => {
    const app = makeApp();
    const token = await makeToken(USER);
    const res = await app.request("/api/notifications/preferences", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ unknown_category: false, like_received: false }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.like_received).toBe(false);
    expect(body).not.toHaveProperty("unknown_category");
  });

  it("401 without auth", async () => {
    const app = makeApp();
    const res = await app.request("/api/notifications/preferences", { method: "PUT" });
    expect(res.status).toBe(401);
  });
});
