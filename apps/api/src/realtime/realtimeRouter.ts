import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type postgres from "postgres";

interface RealtimeOptions {
  heartbeatMs?: number;
}

export function createRealtimeRouter(sql: postgres.Sql, options: RealtimeOptions = {}): Hono {
  const { heartbeatMs = 15000 } = options;
  const app = new Hono();

  app.get("/rides", async (c) => {
    c.header("Cache-Control", "no-cache");
    c.header("X-Accel-Buffering", "no");

    return streamSSE(c, async (stream) => {
      let unlisten: (() => Promise<void>) | undefined;
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

      const aborted = new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });

      try {
        const listenResult = await sql.listen("rides_changed", (payload) => {
          stream
            .writeSSE({
              event: "ride_changed",
              data: payload,
            })
            .catch(() => {});
        });
        unlisten = listenResult.unlisten;

        heartbeatTimer = setInterval(() => {
          stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => {});
        }, heartbeatMs);

        await aborted;
      } finally {
        if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
        if (unlisten) await unlisten().catch(() => {});
      }
    });
  });

  return app;
}
