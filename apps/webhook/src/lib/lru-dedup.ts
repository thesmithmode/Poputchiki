export class LruDedup {
  private map = new Map<number, number>();

  constructor(
    private maxSize = 10_000,
    private ttlMs = 24 * 60 * 60 * 1000,
  ) {}

  has(updateId: number): boolean {
    const now = Date.now();
    for (const [id, exp] of this.map) {
      if (exp <= now) this.map.delete(id);
    }
    return this.map.has(updateId);
  }

  add(updateId: number): void {
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(updateId, Date.now() + this.ttlMs);
  }
}
