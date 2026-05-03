import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { getClientIp } from "../../../src/lib/client-ip";
import { readJson } from "../../helpers/json";

async function getIp(opts: {
  socketIp?: string;
  headers?: Record<string, string>;
  envProxy?: string;
}): Promise<string> {
  if (opts.envProxy !== undefined) {
    process.env.TRUSTED_PROXIES = opts.envProxy;
  }
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (opts.socketIp !== undefined) {
      c.set("socketIp" as never, opts.socketIp);
    }
    await next();
  });
  app.get("/ip", (c) => c.json({ ip: getClientIp(c) }));
  const res = await app.request("/ip", { headers: opts.headers ?? {} });
  const body = await readJson(res);
  return body.ip;
}

describe("getClientIp", () => {
  const origProxy = process.env.TRUSTED_PROXIES;

  afterEach(() => {
    process.env.TRUSTED_PROXIES = origProxy;
  });

  it("no socket IP and no headers → 'unknown'", async () => {
    const ip = await getIp({ envProxy: "" });
    expect(ip).toBe("unknown");
  });

  it("socket IP set, no XFF → returns socket IP", async () => {
    const ip = await getIp({ socketIp: "203.0.113.7", envProxy: "172.16.0.0/12" });
    expect(ip).toBe("203.0.113.7");
  });

  it("socket IP NOT in trusted proxy → ignores XFF, returns socket IP (anti-spoof)", async () => {
    const ip = await getIp({
      socketIp: "203.0.113.7",
      headers: { "X-Forwarded-For": "1.2.3.4" },
      envProxy: "172.16.0.0/12",
    });
    expect(ip).toBe("203.0.113.7");
  });

  it("socket IP from trusted proxy → trusts XFF first IP", async () => {
    const ip = await getIp({
      socketIp: "172.20.0.2",
      headers: { "X-Forwarded-For": "203.0.113.1, 5.6.7.8" },
      envProxy: "172.16.0.0/12",
    });
    expect(ip).toBe("203.0.113.1");
  });

  it("socket IP from trusted proxy, X-Real-IP, no XFF → uses X-Real-IP", async () => {
    const ip = await getIp({
      socketIp: "172.20.0.2",
      headers: { "X-Real-IP": "198.51.100.5" },
      envProxy: "172.16.0.0/12",
    });
    expect(ip).toBe("198.51.100.5");
  });

  it("socket IP from trusted proxy, no XFF/Real-IP → falls back to socket IP", async () => {
    const ip = await getIp({ socketIp: "172.20.0.2", envProxy: "172.16.0.0/12" });
    expect(ip).toBe("172.20.0.2");
  });

  it("default TRUSTED_PROXIES covers 172.16.0.0/12 docker bridge", async () => {
    delete process.env.TRUSTED_PROXIES;
    const ip = await getIp({
      socketIp: "172.17.0.2",
      headers: { "X-Forwarded-For": "55.66.77.88" },
    });
    expect(ip).toBe("55.66.77.88");
  });

  it("multiple TRUSTED_PROXIES CIDRs (comma-separated)", async () => {
    const ip = await getIp({
      socketIp: "10.0.0.1",
      headers: { "X-Forwarded-For": "200.1.2.3" },
      envProxy: "172.16.0.0/12,10.0.0.0/8",
    });
    expect(ip).toBe("200.1.2.3");
  });

  it("REGRESSION: untrusted client with XFF cannot bypass rate-limit ceiling", async () => {
    // Attacker sends fake XFF on every request from same socket.
    // Each request must resolve to the SAME (real) IP.
    const attackerSocket = "203.0.113.99";
    const ip1 = await getIp({
      socketIp: attackerSocket,
      headers: { "X-Forwarded-For": "1.1.1.1" },
      envProxy: "172.16.0.0/12",
    });
    const ip2 = await getIp({
      socketIp: attackerSocket,
      headers: { "X-Forwarded-For": "2.2.2.2" },
      envProxy: "172.16.0.0/12",
    });
    expect(ip1).toBe(attackerSocket);
    expect(ip2).toBe(attackerSocket);
  });
});
