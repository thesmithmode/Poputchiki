import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { captureSocketIp } from "../../../src/middleware/capture-socket-ip";

describe("captureSocketIp middleware", () => {
  it("server.requestIP returns address → c.var.socketIp set", async () => {
    const app = new Hono();
    app.use("*", captureSocketIp());
    app.get("/", (c) => c.json({ ip: c.get("socketIp" as never) ?? null }));
    const fakeServer = {
      requestIP: () => ({ address: "10.20.30.40" }),
    };
    const res = await app.request("/", {}, { server: fakeServer });
    expect((await res.json()).ip).toBe("10.20.30.40");
  });

  it("no env.server → no socketIp set, request still succeeds", async () => {
    const app = new Hono();
    app.use("*", captureSocketIp());
    app.get("/", (c) => c.json({ ip: c.get("socketIp" as never) ?? null }));
    const res = await app.request("/");
    expect((await res.json()).ip).toBeNull();
  });

  it("server.requestIP returns null → no socketIp set", async () => {
    const app = new Hono();
    app.use("*", captureSocketIp());
    app.get("/", (c) => c.json({ ip: c.get("socketIp" as never) ?? null }));
    const fakeServer = { requestIP: () => null };
    const res = await app.request("/", {}, { server: fakeServer });
    expect((await res.json()).ip).toBeNull();
  });

  it("server.requestIP returns empty address → no socketIp set", async () => {
    const app = new Hono();
    app.use("*", captureSocketIp());
    app.get("/", (c) => c.json({ ip: c.get("socketIp" as never) ?? null }));
    const fakeServer = { requestIP: () => ({ address: "" }) };
    const res = await app.request("/", {}, { server: fakeServer });
    expect((await res.json()).ip).toBeNull();
  });

  it("server without requestIP method → no socketIp set", async () => {
    const app = new Hono();
    app.use("*", captureSocketIp());
    app.get("/", (c) => c.json({ ip: c.get("socketIp" as never) ?? null }));
    const res = await app.request("/", {}, { server: {} });
    expect((await res.json()).ip).toBeNull();
  });
});
