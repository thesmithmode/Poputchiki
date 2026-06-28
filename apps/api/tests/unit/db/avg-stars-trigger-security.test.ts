import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPaths = [
  "db/migrations/013_avg_stars_trigger.sql",
  "db/migrations/023_split_avg_stars.sql",
  "db/migrations/023_split_avg_stars.down.sql",
];

function avgStarsFunctionBody(sql: string): string {
  const match = sql.match(
    /CREATE OR REPLACE FUNCTION app\.update_user_avg_stars\(\)[\s\S]*?\n\$\$;/,
  );
  expect(match).not.toBeNull();
  return match?.[0] ?? "";
}

describe("avg_stars SECURITY DEFINER trigger hardening", () => {
  it.each(migrationPaths)("hardens %s against temp-object search_path shadowing", (path) => {
    const body = avgStarsFunctionBody(readFileSync(path, "utf8"));

    expect(body).toMatch(/SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS \$\$/);
    expect(body).not.toMatch(/\bUPDATE users\b/);
    expect(body).not.toMatch(/\bFROM reviews\b/);
    expect(body).toContain("UPDATE public.users");
    expect(body).toContain("FROM public.reviews");
  });
});
