import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createComplaintsRouter } from "../../../src/complaints/complaintsRouter";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
/**
 * Integration: POST /api/complaints + auto-ban trigger.
 * Requires: Postgres + all migrations applied.
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-complaints";

const TARGET = { id: "00000000-0000-4000-f000-400000000001", tgId: 9700001, role: "user" as const };
const RIDE_ID = "00000000-0000-4000-f000-400000000100";
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
    await tx`DELETE FROM ride_participation WHERE ride_id = ${RIDE_ID}`;
    await tx`DELETE FROM rides WHERE id = ${RIDE_ID}`;
    await tx`
      INSERT INTO rides (id, driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total, seats_taken, status)
      VALUES (${RIDE_ID}, ${TARGET.id}, 'A', 55.7, 49.1, 'B', 55.8, 49.2, now() - interval '2 hours', 4, 4, 'completed')
    `;
    for (const reporter of REPORTERS) {
      await tx`
        INSERT INTO ride_participation (ride_id, passenger_id, driver_marked, passenger_confirmed, marked_at, confirmed_at)
        VALUES (${RIDE_ID}, ${reporter.id}, true, true, now(), now())
      `;
    }
    // Reset target ban status
    await tx`UPDATE users SET is_banned = false WHERE id = ${TARGET.id}`;
  });
});

afterAll(async () => {
  await sql`DELETE FROM complaints WHERE target_id = ${TARGET.id}`;
  await sql`DELETE FROM ride_participation WHERE ride_id = ${RIDE_ID}`;
  await sql`DELETE FROM rides WHERE id = ${RIDE_ID}`;
  const ids = [TARGET.id, ...REPORTERS.map((r) => r.id)];
  for (const id of ids) {
    await sql`DELETE FROM users WHERE id = ${id}`;
  }
  await sql.end();
});

describe("POST /api/complaints", () => {
  it("201 — valid complaint", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[0] as NonNullable<(typeof REPORTERS)[0]>);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_user_id: TARGET.id,
        target_ride_id: RIDE_ID,
        reason_code: "spam",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.reporter_id).toBe(REPORTERS[0]?.id);
    expect(body.target_id).toBe(TARGET.id);
    expect(body.status).toBe("open");
  });

  it("409 — duplicate complaint same week same pair", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[0] as NonNullable<(typeof REPORTERS)[0]>);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_user_id: TARGET.id,
        target_ride_id: RIDE_ID,
        reason_code: "spam",
      }),
    });
    expect(res.status).toBe(409);
  });

  it("422 — invalid reason_code", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[1] as NonNullable<(typeof REPORTERS)[0]>);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_user_id: TARGET.id,
        target_ride_id: RIDE_ID,
        reason_code: "invalid",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — cannot complain about self", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[1] as NonNullable<(typeof REPORTERS)[0]>);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_user_id: REPORTERS[1]?.id,
        target_ride_id: RIDE_ID,
        reason_code: "spam",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — target_ride_id is required", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[1] as NonNullable<(typeof REPORTERS)[0]>);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_user_id: TARGET.id, reason_code: "spam" }),
    });
    expect(res.status).toBe(422);
  });

  it("403 — complaint without confirmed shared ride", async () => {
    const app = makeApp();
    const token = await makeToken(REPORTERS[1] as NonNullable<(typeof REPORTERS)[0]>);
    const res = await app.request("/api/complaints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_user_id: TARGET.id,
        target_ride_id: "00000000-0000-4000-f000-400000000999",
        reason_code: "spam",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("5 confirmed ride complaints from 5 different reporters → target gets banned", async () => {
    // REPORTERS[0] already filed one; file from REPORTERS[1..4]
    const app = makeApp();
    for (const reporter of REPORTERS.slice(1)) {
      const token = await makeToken(reporter);
      const res = await app.request("/api/complaints", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_user_id: TARGET.id,
          target_ride_id: RIDE_ID,
          reason_code: "fraud",
        }),
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
