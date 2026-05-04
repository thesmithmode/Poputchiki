export interface RetryOptions {
  maxAttempts?: number;
  baseMs?: number;
  factor?: number;
  retryIf?: (err: unknown) => boolean;
}

function isTransient(err: unknown): boolean {
  if (err == null) return false;
  const code = (err as { code?: string }).code ?? "";
  // postgres transient: connection errors, deadlock
  return (
    code === "CONNECTION_LOST" ||
    code === "CONNECTION_CLOSED" ||
    code === "40P01" || // deadlock detected
    code === "57P01" // admin shutdown
  );
}

const DEFAULT: Required<RetryOptions> = {
  maxAttempts: 5,
  baseMs: 100,
  factor: 2,
  retryIf: isTransient,
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { maxAttempts, baseMs, factor, retryIf } = { ...DEFAULT, ...opts };
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const shouldRetry = retryIf(err);
      if (!shouldRetry || attempt === maxAttempts) throw err;
      const delay = baseMs * factor ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
