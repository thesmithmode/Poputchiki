import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../lib/queryKeys";

const SSE_URL = "/api/realtime/rides";
const FALLBACK_INTERVAL_MS = 30_000;

// Exp backoff steps in ms, capped at 60s
const BACKOFF_STEPS = [1_000, 2_000, 5_000, 15_000, 30_000, 60_000];

function getBackoff(attempt: number): number {
  return BACKOFF_STEPS[Math.min(attempt, BACKOFF_STEPS.length - 1)] ?? 60_000;
}

export function useRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let es: EventSource | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let destroyed = false;

    function invalidate() {
      queryClient.invalidateQueries({ queryKey: queryKeys.rides.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.ride.all });
    }

    function clearRetryTimer() {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    function stopFallback() {
      if (fallbackTimer !== null) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    }

    function startFallback() {
      if (fallbackTimer !== null) return;
      fallbackTimer = setInterval(invalidate, FALLBACK_INTERVAL_MS);
    }

    function scheduleRetry() {
      clearRetryTimer();
      const delay = getBackoff(retryAttempt);
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        if (!destroyed) startSSE();
      }, delay);
    }

    function startSSE() {
      if (destroyed) return;

      // Close any stale connection
      if (es !== null) {
        es.close();
        es = null;
      }

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
        // Keep fallback polling as safety net while retrying
        startFallback();
        scheduleRetry();
      };

      // SSE connected — stop fallback polling and reset backoff
      es.addEventListener("open", () => {
        stopFallback();
        retryAttempt = 0;
      });
    }

    function onOnline() {
      // Network restored: reset backoff and reconnect immediately
      clearRetryTimer();
      retryAttempt = 0;
      stopFallback();
      startSSE();
    }

    window.addEventListener("online", onOnline);
    startSSE();

    return () => {
      destroyed = true;
      es?.close();
      stopFallback();
      clearRetryTimer();
      window.removeEventListener("online", onOnline);
    };
  }, [queryClient]);
}
