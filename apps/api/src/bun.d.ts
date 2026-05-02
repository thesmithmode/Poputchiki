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
  from(str: string, encoding: string): Buffer;
};
interface Buffer extends Uint8Array {}

// Node.js crypto module — Bun implements the full API.
declare module "node:crypto" {
  class Hmac {
    update(data: string | Uint8Array): Hmac;
    digest(): Buffer;
    digest(encoding: "hex"): string;
  }
  function createHmac(algorithm: string, key: string | Uint8Array): Hmac;
  function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}
