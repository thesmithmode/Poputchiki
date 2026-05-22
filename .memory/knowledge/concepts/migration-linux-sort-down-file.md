---
title: "Linux Migration Sort Order — .down.sql Executes Before .sql"
aliases: [migration-linux-sort, down-sql-sort-order, migration-sort-ascii]
tags: [database, migrations, linux, gotcha, ci]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---

# Linux Migration Sort Order — .down.sql Executes Before .sql

On Linux, alphabetical file sort orders `.down.sql` before `.sql` because ASCII `d` (100) < `s` (115). Migration runners that glob files alphabetically will execute the down file before the up file for the same migration number. macOS and Windows use case-insensitive sort which may hide this issue locally.

## Key Points

- `.down.sql` < `.sql` in Linux ASCII sort → down file runs as "up" migration first
- macOS/Windows case-insensitive sort may not reproduce the bug locally — CI (Linux) exposes it
- Fix: guard DDL in down files with `IF NOT EXISTS` (CREATE) / `IF EXISTS` (DROP)
- Alternative naming: `.undo.sql` suffix — but `u` (117) > `s` (115), so `.undo.sql` sorts after `.sql` ✓
- Affected migration: `033_perf_indexes.down.sql`, commit e05104d

## Details

When a migration runner lists files with a pattern like `migrations/**/*.sql`, on Linux the result for migration 033 looks like:

```
033_perf_indexes.down.sql   ← runs first (d=100)
033_perf_indexes.sql        ← runs second (s=115)
```

If the down file contains `DROP INDEX` or `DROP CONSTRAINT` without guards, running it before the up file causes a failure because the objects don't exist yet. When the up file subsequently creates them, CI may pass or fail depending on the runner's error handling.

### Fix Applied in Poputchiki

Migration `033_perf_indexes.down.sql` was updated to use `IF EXISTS`/`IF NOT EXISTS` guards so it is idempotent regardless of execution order:

```sql
-- BEFORE (fragile)
DROP INDEX idx_rides_status_depart;

-- AFTER (idempotent)
DROP INDEX IF EXISTS idx_rides_status_depart;
```

For CREATE statements in down files (unusual but possible in compensating migrations):

```sql
-- Guard CREATE in down files
CREATE INDEX IF NOT EXISTS idx_name ON table(col);
```

### Why macOS Misses This

macOS HFS+ and APFS use case-insensitive collation by default. `d` and `s` sort relative to each other similarly but the interaction with dot-extensions differs. In practice, local development on macOS showed correct order while Linux CI exposed the bug.

### Alternative: .undo.sql Naming

Renaming down files to `.undo.sql` avoids the issue: `u` (117) > `s` (115), so `.undo.sql` sorts after `.sql`. However, this requires updating the migration runner glob pattern and is a larger convention change. The `IF EXISTS` fix is simpler and makes down files genuinely idempotent.

## Related Concepts

- [[concepts/deployment-pipeline]] — CI runs on Linux; this sort issue only manifests there, not in local macOS dev
- [[concepts/unnest-batch-update]] — Migration 033 added indexes to support the UNNEST batch UPDATE performance work

## Sources

- [[daily/2026-05-22.md]] — Session 18:35: migration 033 down-file sort bug on Linux (d < s ASCII); fix: IF NOT EXISTS guards; commit e05104d
