/**
 * Integration: POST/DELETE/GET/PATCH /api/favorites
 * Requires: Postgres + all migrations applied.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { createFavoritesRouter } from "../../../src/favorites/favoritesRouter";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-favorites";

const USER_A = { id: "00000000-0000-4000-f000-200000000001", tgId: 9500001, role: "user" as const };
const USER_B = { id: "00000000-0000-4000-f000-200000000002", tgId: 9500002, role: "user" as const };
const USER_C = { id: "00000000-0000-4000-f000-200000000003", tgId: 9500003, role: "user" as const };

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
  app.route("/api/favorites", createFavoritesRouter(sql));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${USER_A.id}, ${USER_A.tgId}, 'Fav UserA'),
        (${USER_B.id}, ${USER_B.tgId}, 'Fav UserB'),
        (${USER_C.id}, ${USER_C.tgId}, 'Fav UserC')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    await tx`DELETE FROM favorites WHERE user_id IN (${USER_A.id}, ${USER_B.id}, ${USER_C.id})`;
  });
});

afterAll(async () => {
  await sql`DELETE FROM favorites WHERE user_id IN (${USER_A.id}, ${USER_B.id}, ${USER_C.id})`;
  await sql`DELETE FROM users WHERE id IN (${USER_A.id}, ${USER_B.id}, ${USER_C.id})`;
  await sql.end();
});

describe("POST /api/favorites", () => {
  it("201 — add USER_B to USER_A favorites", async () => {
    const app = makeApp();
    const token = await makeToken(USER_A);
    const res = await app.request("/api/favorites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${USER_A.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_id: USER_B.id }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.user_id).toBe(USER_A.id);
    expect(body.target_id).toBe(USER_B.id);
    expect(body.notify).toBe(true);
  });

  it("409 — duplicate favorite", async () => {
    const app = makeApp();
    const token = await makeToken(USER_A);
    const res = await app.request("/api/favorites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${USER_A.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_id: USER_B.id }),
    });
    expect(res.status).toBe(409);
  });

  it("422 — cannot favorite self", async () => {
    const app = makeApp();
    const token = await makeToken(USER_A);
    const res = await app.request("/api/favorites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${USER_A.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_id: USER_A.id }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — missing target_id", async () => {
    const app = makeApp();
    const token = await makeToken(USER_A);
    const res = await app.request("/api/favorites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${USER_A.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it("401 without auth", async () => {
    const app = makeApp();
    const res = await app.request("/api/favorites", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/favorites/me", () => {
  it("200 — returns own favorites list", async () => {
    const app = makeApp();
    const token = await makeToken(USER_A);
    const res = await app.request("/api/favorites/me", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER_A.tgId}` },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const fav = body.find((f: { target_id: string }) => f.target_id === USER_B.id);
    expect(fav).toBeDefined();
    expect(fav.display_name).toBeDefined();
  });

  it("200 — USER_B sees empty list (hasn't favorited anyone)", async () => {
    const app = makeApp();
    const token = await makeToken(USER_B);
    const res = await app.request("/api/favorites/me", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER_B.tgId}` },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });
});

describe("PATCH /api/favorites/:target_id", () => {
  it("200 — toggle notify to false", async () => {
    const app = makeApp();
    const token = await makeToken(USER_A);
    const res = await app.request(`/api/favorites/${USER_B.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${USER_A.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notify: false }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.notify).toBe(false);
  });

  it("404 — target not in favorites", async () => {
    const app = makeApp();
    const token = await makeToken(USER_A);
    const res = await app.request(`/api/favorites/${USER_C.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${USER_A.tgId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notify: false }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/favorites/:target_id", () => {
  it("204 — remove from favorites", async () => {
    const app = makeApp();
    const token = await makeToken(USER_A);
    const res = await app.request(`/api/favorites/${USER_B.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER_A.tgId}` },
    });
    expect(res.status).toBe(204);
  });

  it("404 — not in favorites", async () => {
    const app = makeApp();
    const token = await makeToken(USER_A);
    const res = await app.request(`/api/favorites/${USER_B.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER_A.tgId}` },
    });
    expect(res.status).toBe(404);
  });
});
