import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BACKEND_DOCKERFILES = [
  "apps/api/Dockerfile",
  "apps/notifier/Dockerfile",
  "apps/cron/Dockerfile",
  "apps/webhook/Dockerfile",
];

describe("backend Dockerfiles", () => {
  it("install only production dependencies in runtime images", () => {
    for (const file of BACKEND_DOCKERFILES) {
      const dockerfile = readFileSync(file, "utf8");
      expect(dockerfile, file).toContain("bun install --frozen-lockfile --production");
    }
  });

  it("remove Bun install cache from runtime images", () => {
    for (const file of BACKEND_DOCKERFILES) {
      const dockerfile = readFileSync(file, "utf8");
      expect(dockerfile, file).toContain("rm -rf /root/.bun/install/cache");
    }
  });
});
