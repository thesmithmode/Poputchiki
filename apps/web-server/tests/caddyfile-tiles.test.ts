import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const caddyfile = readFileSync(new URL("../Caddyfile", import.meta.url), "utf8");

describe("web-server Caddyfile tile privacy", () => {
  it("proxies map tiles through same-origin /tiles handlers", () => {
    expect(caddyfile).toContain("handle_path /tiles/a/*");
    expect(caddyfile).toContain("handle_path /tiles/b/*");
    expect(caddyfile).toContain("handle_path /tiles/c/*");
    expect(caddyfile).toContain("reverse_proxy https://a.tile.openstreetmap.org");
    expect(caddyfile).toContain("reverse_proxy https://b.tile.openstreetmap.org");
    expect(caddyfile).toContain("reverse_proxy https://c.tile.openstreetmap.org");
  });

  it("does not allow browser image/connect requests directly to OSM tile origins", () => {
    const cspLine = caddyfile.split("\n").find((line) => line.includes("Content-Security-Policy"));

    expect(cspLine).toBeDefined();
    expect(cspLine).not.toContain("https://*.tile.openstreetmap.org");
  });
});
