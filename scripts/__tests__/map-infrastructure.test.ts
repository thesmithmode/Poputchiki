import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");

describe("map production infrastructure contract", () => {
  it("points MapScreen production tiles at the same-origin /tiles proxy", () => {
    const source = readFileSync(join(repoRoot, "web/src/screens/MapScreen.tsx"), "utf-8");

    expect(source).toContain("/tiles/{s}/{z}/{x}/{y}.png");
    expect(source).not.toContain("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  it("allows the web app origin to request browser geolocation", () => {
    const caddyfile = readFileSync(join(repoRoot, "apps/web-server/Caddyfile"), "utf-8");

    expect(caddyfile).toContain("geolocation=(self)");
  });
});
