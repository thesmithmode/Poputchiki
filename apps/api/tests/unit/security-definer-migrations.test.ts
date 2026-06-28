import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..", "..", "..");
const migrationsDir = join(root, "db", "migrations");

const securityDefinerMigrationFiles = [
  "002_rides.sql",
  "006_pgcrypto_pii.sql",
  "007_counter_triggers.sql",
  "012_unbook_seat.sql",
  "013_avg_stars_trigger.sql",
  "016_anonymize_user.sql",
  "023_split_avg_stars.sql",
  "023_split_avg_stars.down.sql",
  "024_book_seat_fix.sql",
  "024_book_seat_fix.down.sql",
  "042_avatar_cache.sql",
  "042_avatar_cache.down.sql",
];

function securityDefinerBlocks(sql: string): string[] {
  return (
    sql.match(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION[\s\S]*?SECURITY\s+DEFINER[\s\S]*?\$\$;/gi) ??
    []
  );
}

describe("SECURITY DEFINER migration hardening", () => {
  it("pins pg_temp last in every SECURITY DEFINER search_path", () => {
    for (const file of securityDefinerMigrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      const definitions =
        sql.match(/SECURITY DEFINER\s+(?:SET\s+)?search_path\s*=\s*[^$]+AS\s*\$\$/gi) ?? [];

      for (const definition of definitions) {
        expect(definition, `${file}: ${definition}`).toMatch(/pg_temp\s+AS\s*\$\$/i);
      }
    }
  });

  it("schema-qualifies SECURITY DEFINER references to mutable app tables", () => {
    const unsafePatterns = [
      /\bUPDATE\s+(?!public\.)(?:users|rides)\b/i,
      /\bFROM\s+(?!public\.)(?:users|reviews|rides|complaints)\b/i,
      /\bJOIN\s+(?!public\.)(?:rides)\b/i,
      /RETURNS\s+SETOF\s+(?!public\.)(?:rides)\b/i,
    ];

    for (const file of securityDefinerMigrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      for (const block of securityDefinerBlocks(sql)) {
        for (const pattern of unsafePatterns) {
          expect(block, `${file}: ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });
});
