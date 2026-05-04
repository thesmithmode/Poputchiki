/**
 * Integration: DELETE /api/users/me — soft-delete + anonymization (152-FZ).
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createUsersRouter } from "../../../src/users/usersRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-users-delete-me";

const USER = {
  id: "00000000-0000-4000-d000-760000000001",
  tgId: 9760001,
  role: "user" as const,
};

let sql: ReturnType<typeof createPool>;

async function makeToken(u: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: String(u.tgId), uid: u.id, role: u.role, typ: "access", iat: now, exp: now + 3600 },
    JWT_SECRET,
  );
}

function makeApp() {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/users", createUsersRouter(sql));
  return app;
}

function authHeaders(u: { tgId: number }, token: string) {
  return { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${u.tgId}` };
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name, tg_username)
      VALUES (${USER.id}, ${USER.tgId}, 'Delete Me User', 'deleteme')
      ON CONFLICT (tg_id) DO NOTHING
    `;
  });
});

afterAll(async () => {
  await sql`DELETE FROM audit_log WHERE user_id = ${USER.id}`;
  await sql`DELETE FROM favorites WHERE user_id = ${USER.id}`;
  await sql`DELETE FROM rides WHERE driver_id = ${USER.id}`;
  await sql`DELETE FROM users WHERE id = ${USER.id}`;
  await sql.end();
});

beforeEach(async () => {
  // Reset to non-deleted state
  await sql`
    UPDATE users SET
      display_name = 'Delete Me User', tg_username = 'deleteme',
      is_banned = false, deleted_at = NULL
    WHERE id = ${USER.id}
  `;
  await sql`DELETE FROM rides WHERE driver_id = ${USER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${USER.id}`;
});

describe("DELETE /api/users/me", () => {
  it("200 — пользователь анонимизирован, не физически удалён", async () => {
    const token = await makeToken(USER);
    const res = await makeApp().request("/api/users/me", {
      method: "DELETE",
      headers: authHeaders(USER, token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.deleted).toBe(true);

    const [row] = await sql<
      { display_name: string; deleted_at: Date | null; is_banned: boolean }[]
    >`
      SELECT display_name, deleted_at, is_banned FROM users WHERE id = ${USER.id}
    `;
    expect(row?.display_name).toBe("Удалённый");
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.is_banned).toBe(true);
  });

  it("активные rides водителя отменяются при удалении", async () => {
    let rideId: string;
    await withSystem(sql, async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO rides
          (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
           departure_at, seats_total)
        VALUES
          (${USER.id}, 'A', 55, 49, 'B', 56, 50, NOW() + INTERVAL '5 hours', 3)
        RETURNING id
      `;
      rideId = row!.id;
    });

    const token = await makeToken(USER);
    await makeApp().request("/api/users/me", {
      method: "DELETE",
      headers: authHeaders(USER, token),
    });

    const [ride] = await sql<{ status: string }[]>`SELECT status FROM rides WHERE id = ${rideId!}`;
    expect(ride?.status).toBe("cancelled");
  });

  it("audit_log запись user_self_delete", async () => {
    const token = await makeToken(USER);
    await makeApp().request("/api/users/me", {
      method: "DELETE",
      headers: authHeaders(USER, token),
    });
    const [audit] = await sql<{ action: string }[]>`
      SELECT action FROM audit_log
      WHERE user_id = ${USER.id} AND action = 'user_self_delete'
      LIMIT 1
    `;
    expect(audit?.action).toBe("user_self_delete");
  });

  it("401 без auth", async () => {
    const res = await makeApp().request("/api/users/me", { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});
