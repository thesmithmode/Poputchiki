export const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export function backoffDelayMs(attempt: number): number {
  return BACKOFF_DELAYS_MS[Math.min(attempt, BACKOFF_DELAYS_MS.length - 1)] as number;
}

export interface ListenWithBackoffOptions {
  onConnected?: () => void;
  onError?: (err: unknown, attempt: number, delayMs: number) => void;
  _sleep?: (ms: number) => Promise<void>;
}

export async function listenWithBackoff(
  listenFn: () => Promise<void>,
  options: ListenWithBackoffOptions = {},
): Promise<void> {
  const {
    onConnected,
    onError,
    /* c8 ignore next -- default only used outside tests */
    _sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  } = options;

  let attempt = 0;
  for (;;) {
    try {
      await listenFn();
      onConnected?.();
      return;
    } catch (err) {
      const delay = backoffDelayMs(attempt);
      onError?.(err, attempt, delay);
      attempt++;
      await _sleep(delay);
    }
  }
}
