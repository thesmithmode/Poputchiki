import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../lib/queryKeys";
import { getTokens } from "../lib/tokenStore";

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
    let sseAbortController: AbortController | null = null;
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

    function stopFetchSSE() {
      if (sseAbortController !== null) {
        sseAbortController.abort();
        sseAbortController = null;
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

    async function startFetchSSE(accessToken: string) {
      stopFetchSSE();
      const controller = new AbortController();
      sseAbortController = controller;

      try {
        const response = await fetch(SSE_URL, {
          credentials: "include",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error("SSE connection failed");

        stopFallback();
        retryAttempt = 0;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!destroyed && !controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            if (event.split("\n").some((line) => line.trim() === "event: ride_changed")) {
              invalidate();
            }
          }
        }
        if (!destroyed && !controller.signal.aborted) throw new Error("SSE stream ended");
      } catch {
        if (destroyed || controller.signal.aborted) return;
        startFallback();
        scheduleRetry();
      } finally {
        if (sseAbortController === controller) sseAbortController = null;
      }
    }

    function startSSE() {
      if (destroyed) return;

      // Close any stale connection
      if (es !== null) {
        es.close();
        es = null;
      }
      stopFetchSSE();

      const tokens = getTokens();
      if (tokens?.access) {
        void startFetchSSE(tokens.access);
        return;
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
      stopFetchSSE();
      stopFallback();
      clearRetryTimer();
      window.removeEventListener("online", onOnline);
    };
  }, [queryClient]);
}
