import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");

describe("deploy workflow backup cron", () => {
  it("loads /opt/poputchiki/.env before running backup-db.sh", () => {
    const cronJobLine = deployWorkflow
      .split("\n")
      .find((line) => line.includes("CRON_JOB=") && line.includes("backup-db.sh"));

    expect(cronJobLine).toBeDefined();
    expect(cronJobLine).toContain("set -a");
    expect(cronJobLine).toContain(". /opt/poputchiki/.env");
    expect(cronJobLine).toContain("set +a");
  });
});
