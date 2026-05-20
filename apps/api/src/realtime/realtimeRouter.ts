import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { logger } from "../lib/logger";
import type { Dispatcher } from "./dispatcher";

interface RealtimeOptions {
  heartbeatMs?: number;
}

// Extracted чтобы branches (stream.aborted/closed/endResolve) покрывались unit
// тестами без необходимости пробивать всю streamSSE pipeline.
interface SSEStreamHandle {
  aborted: boolean;
  closed: boolean;
  abort: () => void;
}

export function createSSEErrorHandler(
  stream: SSEStreamHandle,
  endResolve?: () => void,
): (err: unknown) => void {
  return (err: unknown) => {
    logger.warn({ event: "sse.write_failed", err: String(err) }, "SSE write failed");
    if (!stream.aborted && !stream.closed) {
      stream.abort();
    }
    endResolve?.();
  };
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
      let endResolve: (() => void) | undefined;
      const endOfStream = new Promise<void>((resolve) => {
        endResolve = resolve;
      });
      const closeOnError = createSSEErrorHandler(stream, endResolve);

      const unsubscribe = dispatcher.subscribe((payload) => {
        /* c8 ignore next -- callback fires at runtime via pg_notify, not in unit tests */
        stream.writeSSE({ event: "ride_changed", data: payload }).catch(closeOnError);
      });

      try {
        heartbeatTimer = setInterval(() => {
          /* c8 ignore next -- setInterval callback not triggered in unit tests */
          stream.writeSSE({ event: "heartbeat", data: "" }).catch(closeOnError);
        }, heartbeatMs);

        await Promise.race([aborted, endOfStream]);
      } finally {
        if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
        unsubscribe();
      }
    });
  });

  return app;
}
