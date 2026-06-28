import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");

function migration(name: string): string {
  return readFileSync(join(ROOT, "db", "migrations", name), "utf8");
}

describe("user_stats materialized view aggregation", () => {
  it.each(["010_user_stats_mv.sql", "023_split_avg_stars.sql", "023_split_avg_stars.down.sql"])(
    "%s pre-aggregates independent one-to-many relations before joining users",
    (file) => {
      const sql = migration(file);

      expect(sql).toContain("WITH");
      expect(sql).toContain("driver_rides AS");
      expect(sql).toContain("passenger_rides AS");
      expect(sql).toContain("likes_received AS");
      expect(sql).toContain("review_stats AS");
      expect(sql).not.toMatch(/SUM\(CASE\s+WHEN\s+l\.target_id\s*=\s*u\.id\s+THEN\s+1/);
      expect(sql).not.toMatch(/COUNT\(rv\.id\)/);
    },
  );
});
