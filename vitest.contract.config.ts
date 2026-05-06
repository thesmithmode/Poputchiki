import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["apps/*/tests/contract/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
});
