import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration023 = readFileSync("db/migrations/023_split_avg_stars.sql", "utf8");
const latestRepairMigration = readFileSync(
  "db/migrations/043_fix_user_stats_review_counts.sql",
  "utf8",
);

function materializedViewSql(sql: string): string {
  return sql.slice(sql.indexOf("CREATE MATERIALIZED VIEW user_stats AS"));
}

describe("user_stats review aggregation", () => {
  it("counts distinct reviews in migration 023 to avoid one-to-many join fanout", () => {
    const viewSql = materializedViewSql(migration023);

    expect(viewSql).toContain("COUNT(DISTINCT rv.id)  FILTER (WHERE rv.target_id = u.id)");
    expect(viewSql).toContain(
      "COUNT(DISTINCT rv.id)  FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id = u.id)::int",
    );
    expect(viewSql).toContain(
      "COUNT(DISTINCT rv.id)  FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id <> u.id)::int",
    );
    expect(viewSql).not.toContain("COUNT(rv.id)  FILTER");
  });

  it("ships a forward repair migration for databases that already applied 023", () => {
    const viewSql = materializedViewSql(latestRepairMigration);

    expect(latestRepairMigration).toContain("DROP VIEW IF EXISTS user_stats_view");
    expect(latestRepairMigration).toContain("DROP MATERIALIZED VIEW IF EXISTS user_stats");
    expect(viewSql).toContain("COUNT(DISTINCT rv.id)  FILTER");
    expect(viewSql).not.toContain("COUNT(rv.id)  FILTER");
    expect(viewSql).toContain("CREATE VIEW user_stats_view AS SELECT * FROM user_stats");
  });
});
