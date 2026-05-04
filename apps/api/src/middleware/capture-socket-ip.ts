import type { MiddlewareHandler } from "hono";

/**
 * Captures the real TCP socket peer IP from Bun's server.requestIP and stores it
 * in c.var.socketIp. Required for getClientIp() anti-spoof logic.
 *
 * Mounted as the FIRST middleware in app.ts. The `server` is injected via env
 * by Bun.serve adapter (see apps/api/src/index.ts).
 */
export function captureSocketIp(): MiddlewareHandler {
  return async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: Bun.Server typed via runtime contract
    const server = (c.env as any)?.server as
      | { requestIP?: (req: Request) => { address?: string } | null }
      | undefined;
    const peer = server?.requestIP?.(c.req.raw);
    const address = peer?.address;
    if (typeof address === "string" && address.length > 0) {
      c.set("socketIp" as never, address);
    }
    await next();
  };
}
