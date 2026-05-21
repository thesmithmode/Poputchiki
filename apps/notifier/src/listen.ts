export const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export function backoffDelayMs(attempt: number): number {
  return BACKOFF_DELAYS_MS[Math.min(attempt, BACKOFF_DELAYS_MS.length - 1)] as number;
}

export interface ListenWithBackoffOptions {
  onConnected?: () => void;
  onError?: (err: unknown, attempt: number, delayMs: number) => void;
  _sleep?: (ms: number) => Promise<void>;
  // Позволяет остановить infinite loop (нужно для тестов и graceful shutdown).
  // В prod передаётся AbortSignal от SIGTERM handler.
  abortSignal?: AbortSignal;
}

export async function listenWithBackoff(
  listenFn: () => Promise<void>,
  options: ListenWithBackoffOptions = {},
): Promise<void> {
  /* c8 ignore start -- default _sleep used only outside tests */
  const {
    onConnected,
    onError,
    _sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    abortSignal,
  } = options;
  /* c8 ignore stop */

  let attempt = 0;
  for (;;) {
    if (abortSignal?.aborted) return;
    try {
      await listenFn();
      if (abortSignal?.aborted) return;
      // postgres.js sql.listen() резолвится один раз после ACK LISTEN-команды.
      // Reconnect после disconnect библиотека делает сама через onclose-хук
      // (см. node_modules/postgres/src/index.js функция listen). Поэтому возвращаемся —
      // иначе tight infinite loop: .listen() возвращает Promise немедленно,
      // for(;;) сразу следующий вызов → CPU 100% → OOM → crash-loop.
      onConnected?.();
      return;
    } catch (err) {
      if (abortSignal?.aborted) return;
      const delay = backoffDelayMs(attempt);
      onError?.(err, attempt, delay);
      attempt++;
      await _sleep(delay);
    }
  }
}
