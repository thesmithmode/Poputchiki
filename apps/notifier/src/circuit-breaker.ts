export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  openWindowMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private openAt = 0;
  private readonly failureThreshold: number;
  private readonly openWindowMs: number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.openWindowMs = opts.openWindowMs ?? 30_000;
  }

  get currentState(): CircuitState {
    if (this.state === "open" && Date.now() - this.openAt >= this.openWindowMs) {
      this.state = "half-open";
    }
    return this.state;
  }

  isOpen(): boolean {
    return this.currentState === "open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openAt = Date.now();
    }
  }
}
