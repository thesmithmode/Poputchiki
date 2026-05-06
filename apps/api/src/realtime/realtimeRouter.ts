import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type postgres from "postgres";
import { poolMetrics } from "../db/pool";
import { listenWithBackoff } from "./listen";

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

      poolMetrics.incListenConnections();
      try {
        await listenWithBackoff(async () => {
          const result = await sql.listen("rides_changed", (payload) => {
            /* c8 ignore next -- SSE callback fires at runtime, not in unit tests */
            stream.writeSSE({ event: "ride_changed", data: payload }).catch(() => {});
          });
          unlisten = result.unlisten;
        });

        heartbeatTimer = setInterval(() => {
          /* c8 ignore next -- setInterval callback not triggered in unit tests */
          stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => {});
        }, heartbeatMs);

        await aborted;
      } finally {
        poolMetrics.decListenConnections();
        if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
        if (unlisten) await unlisten().catch(() => {});
      }
    });
  });

  return app;
}
