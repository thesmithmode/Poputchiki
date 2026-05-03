// Minimal Bun type declarations — replaces bun-types package.
// Remove once bun-types is added to devDependencies.

declare namespace Bun {
  interface ServeOptions {
    fetch(req: Request): Response | Promise<Response>;
    port?: number;
    hostname?: string;
  }
  function serve(options: ServeOptions): { stop(): void };
}

interface ImportMeta {
  readonly main: boolean;
}

// Bun is Node.js-compatible: process is available as a global.
// biome-ignore lint/style/noVar: ambient global declaration requires var, not let
declare var process: {
  readonly env: Record<string, string | undefined>;
  readonly argv: readonly string[];
  exit(code?: number): never;
};

// Web API globals available in Bun runtime (not in ES2022 lib alone).
// biome-ignore lint/style/noVar: ambient global declaration requires var, not let
declare var URLSearchParams: {
  new (init?: string): URLSearchParams;
};
interface URLSearchParams {
  get(name: string): string | null;
  entries(): IterableIterator<[string, string]>;
}

// Node.js Buffer — Bun is fully compatible.
// biome-ignore lint/style/noVar: ambient global declaration requires var, not let
declare var Buffer: {
  from(data: string | Uint8Array): Buffer;
  from(str: string, encoding: string): Buffer;
};
interface Buffer extends Uint8Array {
  toString(encoding?: string): string;
}

// Web encoding globals — available in Bun runtime.
declare function btoa(data: string): string;
declare function atob(data: string): string;

// Timer globals — available in Bun runtime (Node.js + browser compatible).
declare function setTimeout(fn: (...args: unknown[]) => void, ms?: number): unknown;
declare function clearTimeout(id: unknown): void;

// Node.js console — available in Bun runtime.
// biome-ignore lint/style/noVar: ambient global declaration requires var, not let
declare var console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
};

// Web Fetch API globals — available in Bun runtime.
interface Headers {
  get(name: string): string | null;
  set(name: string, value: string): void;
  getSetCookie(): string[];
}

// Web Crypto API global — available in Bun runtime.
// biome-ignore lint/style/noVar: ambient global declaration requires var, not let
declare var crypto: {
  randomUUID(): string;
};

// Node.js crypto module — Bun implements the full API.
declare module "node:crypto" {
  class Hmac {
    update(data: string | Uint8Array): Hmac;
    digest(): Buffer;
    digest(encoding: "hex"): string;
  }
  class Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: "hex"): string;
  }
  function createHmac(algorithm: string, key: string | Uint8Array): Hmac;
  function createHash(algorithm: string): Hash;
  function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}
