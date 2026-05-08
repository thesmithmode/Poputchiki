import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Dispatcher } from "./dispatcher";

interface RealtimeOptions {
  heartbeatMs?: number;
}

export function createRealtimeRouter(dispatcher: Dispatcher, options: RealtimeOptions = {}): Hono {
  const { heartbeatMs = 15000 } = options;
  const app = new Hono();

  app.get("/rides", async (c) => {
    c.header("Cache-Control", "no-cache");
    c.header("X-Accel-Buffering", "no");

    return streamSSE(c, async (stream) => {
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

      const aborted = new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });

      const unsubscribe = dispatcher.subscribe((payload) => {
        /* c8 ignore next -- callback fires at runtime via pg_notify, not in unit tests */
        stream.writeSSE({ event: "ride_changed", data: payload }).catch(() => {});
      });

      try {
        heartbeatTimer = setInterval(() => {
          /* c8 ignore next -- setInterval callback not triggered in unit tests */
          stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => {});
        }, heartbeatMs);

        await aborted;
      } finally {
        /* c8 ignore next -- setInterval always assigns before await */
        if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
        unsubscribe();
      }
    });
  });

  return app;
}
