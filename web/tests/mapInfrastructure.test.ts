import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");

describe("map production infrastructure contract", () => {
  it("does not point MapScreen production tiles at the unserved /tiles route", () => {
    const source = readFileSync(join(repoRoot, "web/src/screens/MapScreen.tsx"), "utf-8");

    expect(source).not.toContain("/tiles/{s}");
    expect(source).toContain("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  it("allows the web app origin to request browser geolocation", () => {
    const caddyfile = readFileSync(join(repoRoot, "apps/web-server/Caddyfile"), "utf-8");

    expect(caddyfile).toContain("geolocation=(self)");
  });
});
