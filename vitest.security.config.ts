import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "apps/*/tests/security/**/*.test.ts",
      "apps/*/tests/security/**/*.spec.ts",
      "packages/*/tests/security/**/*.test.ts",
    ],
    exclude: ["node_modules", "dist"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
