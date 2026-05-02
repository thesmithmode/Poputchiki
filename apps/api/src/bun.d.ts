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
