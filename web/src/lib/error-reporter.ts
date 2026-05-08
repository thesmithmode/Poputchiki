const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const SAMPLE_RATE = import.meta.env.PROD ? 0.1 : 1;

let _initialized = false;
let _errorHandler: ((event: ErrorEvent) => void) | null = null;
let _rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

export function _resetForTesting(): void {
  if (_errorHandler) window.removeEventListener("error", _errorHandler as EventListener);
  if (_rejectionHandler)
    window.removeEventListener("unhandledrejection", _rejectionHandler as EventListener);
  _initialized = false;
  _errorHandler = null;
  _rejectionHandler = null;
}

function send(payload: { message: string; stack?: string; url?: string }): void {
  if (Math.random() > SAMPLE_RATE) return;
  navigator.sendBeacon(
    `${API_BASE}/api/client-errors`,
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
  );
}

export function setupErrorReporting(): void {
  if (_initialized) return;
  _initialized = true;

  _errorHandler = (event: ErrorEvent) => {
    const payload: { message: string; stack?: string; url?: string } = {
      message: event.message ?? "unknown error",
      url: window.location.href,
    };
    if (event.error?.stack) payload.stack = event.error.stack;
    send(payload);
  };

  _rejectionHandler = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
    const payload: { message: string; stack?: string; url?: string } = {
      message,
      url: window.location.href,
    };
    if (reason instanceof Error && reason.stack) payload.stack = reason.stack;
    send(payload);
  };

  window.addEventListener("error", _errorHandler as EventListener);
  window.addEventListener("unhandledrejection", _rejectionHandler as EventListener);
}
