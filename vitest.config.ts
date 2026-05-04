import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/*/tests/**/*.test.ts",
      "apps/*/tests/unit/**/*.test.ts",
      "scripts/__tests__/**/*.test.ts",
    ],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "apps/*/src/index.ts",
        "apps/api/src/auth/authRouter.ts",
        "apps/api/src/users/usersRouter.ts",
        "apps/api/src/rides/ridesRouter.ts",
      ],
      thresholds: {
        lines: 95,
        branches: 95,
        functions: 95,
        statements: 95,
      },
    },
  },
});
