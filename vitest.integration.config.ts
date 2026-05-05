import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["apps/*/tests/integration/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      reportsDirectory: "./coverage-integration",
      include: [
        "apps/api/src/auth/authRouter.ts",
        "apps/api/src/users/usersRouter.ts",
        "apps/api/src/rides/ridesRouter.ts",
        "apps/api/src/realtime/realtimeRouter.ts",
      ],
      thresholds: {
        lines: 95,
        branches: 90,
        functions: 95,
        statements: 95,
      },
    },
  },
});
