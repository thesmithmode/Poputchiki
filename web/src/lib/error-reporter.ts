const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const SAMPLE_RATE = import.meta.env.PROD ? 0.1 : 1;

function send(payload: { message: string; stack?: string; url?: string }): void {
  if (Math.random() > SAMPLE_RATE) return;
  navigator.sendBeacon(
    `${API_BASE}/api/client-errors`,
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
  );
}

export function setupErrorReporting(): void {
  window.addEventListener("error", (event) => {
    const payload: { message: string; stack?: string; url?: string } = {
      message: event.message ?? "unknown error",
      url: window.location.href,
    };
    if (event.error?.stack) payload.stack = event.error.stack;
    send(payload);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
    const payload2: { message: string; stack?: string; url?: string } = {
      message,
      url: window.location.href,
    };
    if (reason instanceof Error && reason.stack) payload2.stack = reason.stack;
    send(payload2);
  });
}
