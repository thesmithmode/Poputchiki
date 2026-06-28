import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");

describe("map production infrastructure contract", () => {
  it("routes MapPicker tiles through the same-origin tile proxy", () => {
    const source = readFileSync(join(repoRoot, "web/src/components/MapPicker.tsx"), "utf-8");
    const caddyfile = readFileSync(join(repoRoot, "apps/web-server/Caddyfile"), "utf-8");

    expect(source).toContain('"/tiles/{s}/{z}/{x}/{y}.png"');
    expect(source).not.toContain('"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"');
    expect(caddyfile).toContain("handle_path /tiles/a/*");
    expect(caddyfile).toContain("handle_path /tiles/b/*");
    expect(caddyfile).toContain("handle_path /tiles/c/*");
  });

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
