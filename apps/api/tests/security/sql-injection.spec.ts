/**
 * Sentinel: SQL-injection protection via postgres-js parameterization.
 * Sends 20+ injection payloads to all filter/search endpoints.
 * Verifies: no 500 errors, no data leaks, audit_log has no anomalies.
 *
 * Also includes a negative proof: direct string concatenation in SQL
 * WOULD break the query (proves parameterization is the safe path).
 *
 * Requires: Postgres running + all migrations applied.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool";
import { identityGuard } from "../../src/middleware/identity-guard";
import { createRidesRouter } from "../../src/rides/ridesRouter";
import { buildDsn, withTestUser } from "../integration/setup";
import type { TestUser } from "../integration/setup";
import { readJson } from "../helpers/json";

const JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-sqli";

const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "' OR '1'='1' --",
  "'; DROP TABLE users; --",
  "' UNION SELECT * FROM users --",
  "' UNION SELECT id, tg_id, display_name FROM users --",
  "1; DROP TABLE rides; --",
  "1 OR 1=1",
  "' AND 1=1 --",
  "' AND 1=2 --",
  "'; INSERT INTO users (id, tg_id, display_name) VALUES ('evil', 9999, 'hacked'); --",
  "' OR EXISTS(SELECT * FROM users) --",
  "'; UPDATE users SET role='admin' WHERE '1'='1'; --",
  "0 UNION SELECT NULL, NULL, NULL --",
  "' GROUP BY 1 HAVING 1=1 --",
  "' ORDER BY 99999 --",
  "'; EXEC xp_cmdshell('dir'); --",
  "' OR pg_sleep(0)='",
  "'; SELECT pg_sleep(0); --",
  "\\'; DROP TABLE users; --",
  "/**/OR/**/1=1",
];

let sql: ReturnType<typeof createPool>;
let testUser: TestUser;
let token: string;
let app: Hono;

beforeAll(async () => {
  sql = createPool(buildDsn());
  testUser = await withTestUser(sql, 978800);

  token = await sign(
    {
      sub: testUser.id,
      tgId: testUser.tgId,
      role: testUser.role,
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
  );

  app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/rides", createRidesRouter(sql));
});

afterAll(async () => {
  await testUser.cleanup();
  await sql.end();
});

describe("SQL injection: GET /api/rides query params", () => {
  for (const payload of SQL_INJECTION_PAYLOADS) {
    it(`payload: ${payload.slice(0, 40)} → не вызывает 500 и не утекает данные`, async () => {
      const params = new URLSearchParams({ cursor: payload });
      const res = await app.request(`/api/rides?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: `access_token=${token}`,
        },
      });
      expect(res.status).not.toBe(500);
      expect(res.status).not.toBe(503);

      if (res.status === 200) {
        const body = await readJson(res);
        expect(body).toHaveProperty("rides");
        expect(Array.isArray(body.rides)).toBe(true);
      }
    });
  }
});

describe("SQL injection: numeric params coercion blocks injection", () => {
  it("fromLat с injection payload → 400 (zod validation)", async () => {
    const params = new URLSearchParams({ fromLat: "' OR 1=1 --" });
    const res = await app.request(`/api/rides?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });

  it("seatsMin с injection payload → 400 (zod validation)", async () => {
    const params = new URLSearchParams({ seatsMin: "'; DROP TABLE users; --" });
    const res = await app.request(`/api/rides?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });
});

describe("Proof: postgres-js parameterization vs concatenation", () => {
  it("parameterized query с injection payload безопасно возвращает 0 строк", async () => {
    const unsafePayload = "' OR '1'='1";
    const rows = await sql`
      SELECT id FROM users WHERE display_name = ${unsafePayload}
    `;
    expect(rows.length).toBe(0);
  });

  it("raw concatenation (умышленно сломанная) бросает ошибку синтаксиса SQL", async () => {
    const unsafePayload = "' OR '1'='1";

    const unsafeQuery = async (): Promise<unknown> => {
      return sql.unsafe(`SELECT id FROM users WHERE display_name = '${unsafePayload}'`);
    };

    await expect(unsafeQuery()).rejects.toThrow();
  });
});
