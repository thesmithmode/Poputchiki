import { Hono } from "hono";
import { sign } from "hono/jwt";
import { describe, expect, it, vi } from "vitest";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { readJson } from "../../helpers/json";

const SECRET = "test-jwt-secret-for-unit-tests";
const USER_UUID = "00000000-0000-4000-a000-000000000099";
const TG_ID = 123456789;

async function makeAccessToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(TG_ID),
      uid: USER_UUID,
      typ: "access",
      role: "user",
      iat: now,
      exp: now + 86400,
      ...overrides,
    },
    SECRET,
  );
}

function makeApp() {
  const app = new Hono();
  app.use("/api/*", identityGuard(SECRET));
  app.get("/api/me", (c) => c.json(c.get("user" as never)));
  return app;
}

function withAuth(token: string, cookieTgId: string | null) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (cookieTgId !== null) {
    headers.Cookie = `tg_uid=${cookieTgId}`;
  }
  return headers;
}

describe("identityGuard: missing credentials", () => {
  it("no Authorization header → 401", async () => {
    const app = makeApp();
    const res = await app.request("/api/me", {
      headers: { Cookie: `tg_uid=${TG_ID}` },
    });
    expect(res.status).toBe(401);
  });

  it("no tg_uid cookie → 401", async () => {
    const app = makeApp();
    const token = await makeAccessToken();
    const res = await app.request("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("neither header nor cookie → 401", async () => {
    const app = makeApp();
    const res = await app.request("/api/me");
    expect(res.status).toBe(401);
  });
});

describe("identityGuard: JWT errors", () => {
  it("invalid (garbage) JWT → 401", async () => {
    const app = makeApp();
    const res = await app.request("/api/me", {
      headers: withAuth("not.a.jwt", String(TG_ID)),
    });
    expect(res.status).toBe(401);
  });

  it("wrong secret → 401", async () => {
    const app = makeApp();
    const token = await makeAccessToken();
    const wrongSecret = "different-secret";
    const res = await app.request("/api/me", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${TG_ID}` },
    });
    // The middleware uses SECRET; create a token with wrong secret to verify rejection
    const badToken = await sign(
      { sub: String(TG_ID), uid: USER_UUID, typ: "access", role: "user" },
      wrongSecret,
    );
    const res2 = await app.request("/api/me", {
      headers: { Authorization: `Bearer ${badToken}`, Cookie: `tg_uid=${TG_ID}` },
    });
    expect(res2.status).toBe(401);
    // token signed with correct secret should pass (control)
    expect(res.status).toBe(200);
  });

  it("typ=refresh → 401", async () => {
    const app = makeApp();
    const token = await makeAccessToken({ typ: "refresh" });
    const res = await app.request("/api/me", {
      headers: withAuth(token, String(TG_ID)),
    });
    expect(res.status).toBe(401);
  });
});

describe("identityGuard: cookie/JWT mismatch", () => {
  it("cookie tg_uid !== JWT sub → 401 + clears cookie", async () => {
    const app = makeApp();
    const token = await makeAccessToken(); // sub = TG_ID
    const res = await app.request("/api/me", {
      headers: withAuth(token, "999999"), // wrong tg_uid
    });
    expect(res.status).toBe(401);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tg_uid=");
    expect(setCookie).toContain("Max-Age=0");
  });
});

describe("identityGuard: jti revocation check", () => {
  it("revoked jti → 401", async () => {
    const jti = "revoked-test-jti";
    // biome-ignore lint/suspicious/noExplicitAny: mock sql
    const sql = vi.fn().mockResolvedValueOnce([{ jti }]) as any;
    const app = new Hono();
    app.use("/api/*", identityGuard(SECRET, sql));
    app.get("/api/me", (c) => c.json(c.get("user" as never)));

    const token = await makeAccessToken({ jti });
    const res = await app.request("/api/me", {
      headers: withAuth(token, String(TG_ID)),
    });
    expect(res.status).toBe(401);
  });

  it("valid jti not in revoked_tokens → 200", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock sql
    const sql = vi.fn().mockResolvedValueOnce([]) as any; // empty = not revoked
    const app = new Hono();
    app.use("/api/*", identityGuard(SECRET, sql));
    app.get("/api/me", (c) => c.json(c.get("user" as never)));

    const token = await makeAccessToken({ jti: "fresh-jti-001" });
    const res = await app.request("/api/me", {
      headers: withAuth(token, String(TG_ID)),
    });
    expect(res.status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("no sql provided → skip revocation check (backward compat)", async () => {
    const app = makeApp(); // identityGuard(SECRET) — no sql
    const token = await makeAccessToken({ jti: "any-jti" });
    const res = await app.request("/api/me", {
      headers: withAuth(token, String(TG_ID)),
    });
    expect(res.status).toBe(200);
  });

  it("token without jti → skip revocation check", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock sql
    const sql = vi.fn() as any; // should NOT be called
    const app = new Hono();
    app.use("/api/*", identityGuard(SECRET, sql));
    app.get("/api/me", (c) => c.json(c.get("user" as never)));

    const token = await makeAccessToken(); // no jti field
    const res = await app.request("/api/me", {
      headers: withAuth(token, String(TG_ID)),
    });
    expect(res.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("identityGuard: happy path", () => {
  it("valid JWT + matching cookie → 200 + user in context", async () => {
    const app = makeApp();
    const token = await makeAccessToken();
    const res = await app.request("/api/me", {
      headers: withAuth(token, String(TG_ID)),
    });
    expect(res.status).toBe(200);
    const user = await readJson(res);
    expect(user.id).toBe(USER_UUID);
    expect(user.tgId).toBe(TG_ID);
    expect(user.role).toBe("user");
  });

  it("role is taken from JWT payload", async () => {
    const app = makeApp();
    const token = await makeAccessToken({ role: "admin" });
    const res = await app.request("/api/me", {
      headers: withAuth(token, String(TG_ID)),
    });
    expect(res.status).toBe(200);
    const user = await readJson(res);
    expect(user.role).toBe("admin");
  });

  it("Authorization without 'Bearer ' prefix is accepted", async () => {
    const app = makeApp();
    const token = await makeAccessToken();
    const res = await app.request("/api/me", {
      headers: { Authorization: token, Cookie: `tg_uid=${TG_ID}` },
    });
    expect(res.status).toBe(200);
  });

  it("no role in JWT → defaults to 'user'", async () => {
    const app = makeApp();
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: String(TG_ID), uid: USER_UUID, typ: "access", iat: now, exp: now + 86400 },
      SECRET,
    );
    const res = await app.request("/api/me", {
      headers: withAuth(token, String(TG_ID)),
    });
    expect(res.status).toBe(200);
    const user = await readJson(res);
    expect(user.role).toBe("user");
  });
});
