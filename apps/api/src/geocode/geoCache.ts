interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

export interface GeoCacheOptions {
  maxKeyBytes?: number;
  maxValueBytes?: number;
}

const DEFAULT_MAX_KEY_BYTES = 256;
const DEFAULT_MAX_VALUE_BYTES = 64 * 1024;
const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function serializedByteLength(data: unknown): number {
  try {
    return byteLength(JSON.stringify(data));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export class GeoCache {
  private readonly map = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly maxKeyBytes: number;
  private readonly maxValueBytes: number;

  constructor(maxSize = 1000, ttlMs = 24 * 60 * 60 * 1000, options: GeoCacheOptions = {}) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.maxKeyBytes = options.maxKeyBytes ?? DEFAULT_MAX_KEY_BYTES;
    this.maxValueBytes = options.maxValueBytes ?? DEFAULT_MAX_VALUE_BYTES;
  }

  get(key: string): unknown | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: unknown): void {
    if (byteLength(key) > this.maxKeyBytes || serializedByteLength(data) > this.maxValueBytes) {
      return;
    }

    if (this.map.size >= this.maxSize) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
