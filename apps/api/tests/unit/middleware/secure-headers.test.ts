import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { secureHeadersMiddleware } from "../../../src/middleware/secure-headers";

const DOMAIN = "test.example";

function makeApp(): Hono {
  const app = new Hono();
  app.use("*", secureHeadersMiddleware);
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("secureHeadersMiddleware", () => {
  const origDomain = process.env.DOMAIN;

  beforeEach(() => {
    process.env.DOMAIN = DOMAIN;
  });

  afterEach(() => {
    process.env.DOMAIN = origDomain;
  });

  async function getHeaders(): Promise<Headers> {
    const res = await makeApp().request("/test");
    return res.headers;
  }

  it("sets X-Content-Type-Options: nosniff", async () => {
    const h = await getHeaders();
    expect(h.get("x-content-type-options")).toBe("nosniff");
  });

  it("sets HSTS with max-age=31536000 and includeSubDomains", async () => {
    const h = await getHeaders();
    const hsts = h.get("strict-transport-security") ?? "";
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
  });

  it("sets X-Frame-Options: SAMEORIGIN", async () => {
    const h = await getHeaders();
    expect(h.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("sets Referrer-Policy: strict-origin-when-cross-origin", async () => {
    const h = await getHeaders();
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sets Content-Security-Policy with required directives", async () => {
    const h = await getHeaders();
    const csp = h.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("https://telegram.org");
    expect(csp).toContain("wasm-unsafe-eval");
    expect(csp).toContain("frame-ancestors");
    expect(csp).toContain("https://web.telegram.org");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain(`https://api.${DOMAIN}`);
  });

  it("CSP connect-src includes api.DOMAIN", async () => {
    const h = await getHeaders();
    const csp = h.get("content-security-policy") ?? "";
    expect(csp).toContain(`connect-src 'self' https://api.${DOMAIN}`);
  });

  it("sets Permissions-Policy header", async () => {
    const h = await getHeaders();
    expect(h.get("permissions-policy")).toBeTruthy();
  });

  // --- SPEC §11.1 full CSP sentinel ---

  it("SENTINEL: img-src contains https://*.tile.openstreetmap.org", async () => {
    const csp = (await getHeaders()).get("content-security-policy") ?? "";
    expect(csp).toContain("https://*.tile.openstreetmap.org");
  });

  it("SENTINEL: img-src contains https://t.me", async () => {
    const csp = (await getHeaders()).get("content-security-policy") ?? "";
    expect(csp).toContain("https://t.me");
  });

  it("SENTINEL: connect-src contains https://nominatim.openstreetmap.org", async () => {
    const csp = (await getHeaders()).get("content-security-policy") ?? "";
    expect(csp).toContain("https://nominatim.openstreetmap.org");
  });

  it("SENTINEL: frame-ancestors contains https://web.telegram.org and https://*.telegram.org", async () => {
    const csp = (await getHeaders()).get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors https://web.telegram.org https://*.telegram.org");
  });

  it("SENTINEL: object-src 'none' and base-uri 'self'", async () => {
    const csp = (await getHeaders()).get("content-security-policy") ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("SENTINEL: font-src contains 'self' and data:", async () => {
    const csp = (await getHeaders()).get("content-security-policy") ?? "";
    expect(csp).toContain("font-src 'self' data:");
  });
});
