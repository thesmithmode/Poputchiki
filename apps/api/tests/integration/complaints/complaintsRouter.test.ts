/**
 * Integration: POST /api/complaints + auto-ban trigger.
 * Requires: Postgres + all migrations applied.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createComplaintsRouter } from "../../../src/complaints/complaintsRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-complaints";

const TARGET = { id: "00000000-0000-4000-f000-400000000001", tgId: 9700001, role: "user" as const };
// 5 reporters for auto-ban test
const REPORTERS = Array.from({ length: 5 }, (_, i) => ({
  id: `00000000-0000-4000-f000-4000000000${String(i + 2).padStart(2, "0")}`,
  tgId: 9700002 + i,
  role: "user" as const,
}));

let sql: ReturnType<typeof createPool>;

async function makeToken(u: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: String(u.tgId), uid: u.id, role: u.role, typ: "access", iat: now, exp: now + 3600 },
    JWT_SECRET,
  );
}

function makeApp(): Hono {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/complaints", createComplaintsRouter(sql));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    const users = [TARGET, ...REPORTERS];
    for (const u of users) {
      await tx`
        INSERT INTO users (id, tg_id, display_name)
        VALUES (${u.id}, ${u.tgId}, ${`Complaint User ${u.tgId}`})
        ON CONFLICT (tg_id) DO NOTHING
      `;
    }
    // Clear complaints from previous test runs
    await tx`DELETE FROM complaints WHERE target_id = ${TARGET.id}`;
    // Reset target ban status
    await tx`UPDATE users SET is_banned = false WHERE id = ${TARGET.id}`;
  });
});

afterAll(async () => {
  await sql`DELETE FROM complaints WHERE target_id = ${TARGET.id}`;
  const ids = [TARGET.id, ...REPORTERS.map((r) => r.id)];
  for (const id of ids) {
    await sql`DELETE FROM users WHERE id = ${id}`;
  }
  await sql.end();
});

describe("POST /api/complaints", () => {
  it("201 — valid complaint", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[0]!);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${REPORTERS[0]!.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_user_id: TARGET.id, reason_code: "spam" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.reporter_id).toBe(REPORTERS[0]!.id);
    expect(body.target_id).toBe(TARGET.id);
    expect(body.status).toBe("open");
  });

  it("409 — duplicate complaint same week same pair", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[0]!);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${REPORTERS[0]!.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_user_id: TARGET.id, reason_code: "spam" }),
    });
    expect(res.status).toBe(409);
  });

  it("422 — invalid reason_code", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[1]!);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${REPORTERS[1]!.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_user_id: TARGET.id, reason_code: "invalid" }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — cannot complain about self", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[1]!);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${REPORTERS[1]!.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_user_id: REPORTERS[1]!.id, reason_code: "spam" }),
    });
    expect(res.status).toBe(422);
  });

  it("5 complaints from 5 different reporters → target gets banned", async () => {
    // REPORTERS[0] already filed one; file from REPORTERS[1..4]
    const app = makeApp();
    for (const reporter of REPORTERS.slice(1)) {
      const token = await makeToken(reporter);
      const res = await app.request("/api/complaints", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: `tg_uid=${reporter.tgId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target_user_id: TARGET.id, reason_code: "fraud" }),
      });
      expect(res.status).toBe(201);
    }

    // Check target is banned
    const rows = await sql`SELECT is_banned FROM users WHERE id = ${TARGET.id}`;
    expect(rows[0]?.is_banned).toBe(true);
  });

  it("401 without auth", async () => {
    const app = makeApp();
    const res = await app.request("/api/complaints", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
