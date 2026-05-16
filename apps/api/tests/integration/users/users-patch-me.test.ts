/**
 * Integration: PATCH /api/users/me
 * Requires: Postgres + migrations 000-010 applied.
 */
import { sessBind } from "../../helpers/auth";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { auditLog } from "../../../src/middleware/audit-log";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createUsersRouter } from "../../../src/users/usersRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-users-patch-me";
const PII_KEY = "test-pgcrypto-key-for-patch-me";

const ME = { id: "00000000-0000-4000-d000-300000000001", tgId: 7200001, role: "user" as const };

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
  app.use("/api/*", auditLog(sql));
  app.route("/api/users", createUsersRouter(sql));
  return app;
}

beforeAll(async () => {
  process.env.PGCRYPTO_KEY = PII_KEY;
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES (${ME.id}, ${ME.tgId}, 'Original Name')
      ON CONFLICT (tg_id) DO UPDATE SET display_name = 'Original Name', phone_enc = NULL
    `;
  });
});

afterAll(async () => {
  process.env.PGCRYPTO_KEY = undefined;
  await sql`DELETE FROM users WHERE id = ${ME.id}`;
  await sql.end();
});

describe("PATCH /api/users/me", () => {
  it("updates display_name → 200 with updated profile", async () => {
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
    const body = await readJson(res);
    expect(body.display_name).toBe("Updated Name");
    expect(body.id).toBe(ME.id);
    expect(body.role).toBe("user");
    expect(body.stats).toBeDefined();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("saves phone encrypted, not in response, plaintext not in audit_log", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const phone = "+79991234567";
    const res = await app.request("/api/users/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("phone_enc");

    const dbRows = await sql`SELECT phone_enc FROM users WHERE id = ${ME.id}`;
    expect(dbRows[0]?.phone_enc).not.toBeNull();
    expect(String(dbRows[0]?.phone_enc)).not.toContain(phone);

    const auditRows = await sql`
      SELECT meta FROM audit_log
      WHERE user_id = ${ME.id} AND action LIKE 'PATCH%'
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(JSON.stringify(auditRows[0]?.meta ?? {})).not.toContain(phone);
  });

  it("422 on empty display_name", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ display_name: "" }),
    });
    expect(res.status).toBe(422);
  });

  it("422 on display_name > 50 chars", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ display_name: "x".repeat(51) }),
    });
    expect(res.status).toBe(422);
  });

  it("empty body {} → 200 no-op returns current profile", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.id).toBe(ME.id);
  });

  it("401 without auth", async () => {
    const app = makeApp();
    const res = await app.request("/api/users/me", { method: "PATCH" });
    expect(res.status).toBe(401);
  });

  it("sets onboarded=true → 200 and onboarded field in response", async () => {
    const app = makeApp();
    const token = await makeToken(ME);
    const res = await app.request("/api/users/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ onboarded: true }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.onboarded).toBe(true);
  });
});
