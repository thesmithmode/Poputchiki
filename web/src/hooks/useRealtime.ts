import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const SSE_URL = "/api/realtime/rides";
const FALLBACK_INTERVAL_MS = 30_000;

export function useRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let es: EventSource | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    function invalidate() {
      queryClient.invalidateQueries({ queryKey: ["rides"] });
    }

    function startSSE() {
      if (typeof EventSource === "undefined") {
        startFallback();
        return;
      }

      es = new EventSource(SSE_URL, { withCredentials: true });

      es.addEventListener("ride_changed", () => {
        invalidate();
      });

      es.onerror = () => {
        es?.close();
        es = null;
        // SSE failed → switch to polling fallback
        startFallback();
      };
    }

    function startFallback() {
      if (fallbackTimer !== null) return;
      fallbackTimer = setInterval(invalidate, FALLBACK_INTERVAL_MS);
    }

    startSSE();

    return () => {
      es?.close();
      if (fallbackTimer !== null) clearInterval(fallbackTimer);
    };
  }, [queryClient]);
}
