import { Hono } from "hono";
import { sign } from "hono/jwt";
import { describe, expect, it, vi } from "vitest";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";

const SECRET = "test-jwt-secret-for-unit-tests-!!";
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
      jti: crypto.randomUUID(),
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

// Строит заголовки с корректным sess_bind (по умолчанию) или без/с неверным cookie.
function withAuth(token: string, cookie: "correct" | "wrong" | null = "correct") {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (cookie === "correct") {
    headers.Cookie = `sess_bind=${sessBind(SECRET, token)}`;
  } else if (cookie === "wrong") {
    headers.Cookie = "sess_bind=wrongbindingvalue1234567890abcdef";
  }
  // null = cookie вообще не передаётся
  return headers;
}

describe("identityGuard: missing credentials", () => {
  it("no Authorization header → 401", async () => {
    const app = makeApp();
    const token = await makeAccessToken();
    const res = await app.request("/api/me", {
      headers: { Cookie: `sess_bind=${sessBind(SECRET, token)}` },
    });
    expect(res.status).toBe(401);
  });

  it("no sess_bind cookie → 401", async () => {
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
      headers: withAuth("not.a.jwt", "wrong"),
    });
    expect(res.status).toBe(401);
  });

  it("wrong secret → 401", async () => {
    const app = makeApp();
    const token = await makeAccessToken();
    const controlRes = await app.request("/api/me", {
      headers: withAuth(token),
    });

    const badToken = await sign(
      { sub: String(TG_ID), uid: USER_UUID, typ: "access", role: "user", jti: crypto.randomUUID() },
      "different-secret",
    );
    const res2 = await app.request("/api/me", {
      headers: {
        Authorization: `Bearer ${badToken}`,
        Cookie: `sess_bind=${sessBind(SECRET, token)}`,
      },
    });
    expect(res2.status).toBe(401);
    // control: токен с правильным секретом проходит
    expect(controlRes.status).toBe(200);
  });

  it("typ=refresh → 401", async () => {
    const app = makeApp();
    const token = await makeAccessToken({ typ: "refresh" });
    const res = await app.request("/api/me", {
      headers: withAuth(token),
    });
    expect(res.status).toBe(401);
  });

  it("token without jti → 401 (jti обязателен)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock sql
    const sql = vi.fn() as any;
    const app = new Hono();
    app.use("/api/*", identityGuard(SECRET, sql));
    app.get("/api/me", (c) => c.json(c.get("user" as never)));

    const now = Math.floor(Date.now() / 1000);
    // Токен без jti — identityGuard должен вернуть 401
    const tokenNoJti = await sign(
      {
        sub: String(TG_ID),
        uid: USER_UUID,
        typ: "access",
        role: "user",
        iat: now,
        exp: now + 86400,
      },
      SECRET,
    );
    const res = await app.request("/api/me", {
      // sess_bind без jti не вычислить корректно — передаём произвольное значение
      headers: {
        Authorization: `Bearer ${tokenNoJti}`,
        Cookie: "sess_bind=anybindingvalue123456789012345",
      },
    });
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("identityGuard: sess_bind mismatch", () => {
  it("неверный sess_bind → 401 + очищает cookie", async () => {
    const app = makeApp();
    const token = await makeAccessToken();
    const res = await app.request("/api/me", {
      headers: withAuth(token, "wrong"),
    });
    expect(res.status).toBe(401);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sess_bind=");
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
      headers: withAuth(token),
    });
    expect(res.status).toBe(401);
  });

  it("valid jti not in revoked_tokens → 200", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock sql for testing
    const sql = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ display_name: "Test User" }]) as any;
    const app = new Hono();
    app.use("/api/*", identityGuard(SECRET, sql));
    app.get("/api/me", (c) => c.json(c.get("user" as never)));

    const token = await makeAccessToken({ jti: "fresh-jti-001" });
    const res = await app.request("/api/me", {
      headers: withAuth(token),
    });
    expect(res.status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("no sql provided → skip revocation check", async () => {
    const app = makeApp(); // identityGuard(SECRET) — no sql
    const token = await makeAccessToken({ jti: "any-jti" });
    const res = await app.request("/api/me", {
      headers: withAuth(token),
    });
    expect(res.status).toBe(200);
  });
});

describe("identityGuard: happy path", () => {
  it("valid JWT + matching sess_bind → 200 + user in context", async () => {
    const app = makeApp();
    const token = await makeAccessToken();
    const res = await app.request("/api/me", {
      headers: withAuth(token),
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
      headers: withAuth(token),
    });
    expect(res.status).toBe(200);
    const user = await readJson(res);
    expect(user.role).toBe("admin");
  });

  it("Authorization without 'Bearer ' prefix is accepted", async () => {
    const app = makeApp();
    const token = await makeAccessToken();
    const res = await app.request("/api/me", {
      headers: { Authorization: token, Cookie: `sess_bind=${sessBind(SECRET, token)}` },
    });
    expect(res.status).toBe(200);
  });

  it("SENTINEL: expired JWT → 401", async () => {
    const app = makeApp();
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();
    const token = await sign(
      {
        sub: String(TG_ID),
        uid: USER_UUID,
        typ: "access",
        role: "user",
        jti,
        iat: now - 7200,
        exp: now - 60,
      },
      SECRET,
    );
    const res = await app.request("/api/me", {
      headers: withAuth(token),
    });
    expect(res.status).toBe(401);
  });

  it("no role in JWT → defaults to 'user'", async () => {
    const app = makeApp();
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();
    const token = await sign(
      { sub: String(TG_ID), uid: USER_UUID, typ: "access", jti, iat: now, exp: now + 86400 },
      SECRET,
    );
    const res = await app.request("/api/me", {
      headers: withAuth(token),
    });
    expect(res.status).toBe(200);
    const user = await readJson(res);
    expect(user.role).toBe("user");
  });
});
