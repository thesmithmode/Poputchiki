import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deploy workflow GHCR login retry", () => {
  it("fails the login step after all retries are exhausted", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

    expect(workflow).toMatch(
      /- name: Log in to GHCR[\s\S]*docker login ghcr\.io[\s\S]*exit 1[\s\S]*- name: Set up Docker Buildx/,
    );
  });
});
