---
title: "Single-SQL Cron Expand via INSERT...SELECT...GENERATE_SERIES"
aliases: [generate-series-expand, single-sql-expand, expand-templates-sql, cron-expand-generate-series]
tags: [postgresql, cron, performance, pattern, backend]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---

# Single-SQL Cron Expand via INSERT...SELECT...GENERATE_SERIES

Replacing nested application-code loops (template × date) with a single PostgreSQL `INSERT...SELECT...GENERATE_SERIES` statement eliminates 150,000 async round-trips from the `expand_templates` cron job. Date range expansion, weekday filtering, and idempotency all happen inside one SQL statement that PostgreSQL executes as a single plan.

## Key Points

- Nested loops: `for (template) { for (date of 30 days) { await INSERT } }` = ~150k awaits at 2000 users × 3 templates × 30 days
- Single SQL: `INSERT ... SELECT template.fields, gs.date FROM ride_templates CROSS JOIN GENERATE_SERIES(...) AS gs ON CONFLICT DO NOTHING`
- `GENERATE_SERIES(CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', INTERVAL '1 day')` generates all dates server-side
- Weekday filter (`WHERE EXTRACT(DOW FROM gs.dt) = t.weekday`) inside the SELECT — no application-level date math
- `ON CONFLICT DO NOTHING` with unique partial index provides idempotency — safe to re-run without duplicates

## Details

The original `expand-templates.ts` implementation:

```typescript
// BEFORE: nested loops, ~150k async round-trips
for (const template of allTemplates) {
  const next30Days = getDates(30); // application generates dates
  for (const date of next30Days) {
    await sql`
      INSERT INTO rides (template_id, departure_at, ...)
      SELECT ... WHERE NOT EXISTS (
        SELECT 1 FROM rides
        WHERE template_id = ${template.id} AND departure_at = ${date}
      )
    `;
  }
}
```

Problems: 150k round-trips, large application memory for all templates + dates, complex crash-resume logic.

The single-SQL replacement:

```sql
-- Single SQL: generates all dates, filters weekdays, inserts idempotently
INSERT INTO rides (template_id, from_lat, from_lng, to_lat, to_lng, departure_at, seats_total, ...)
SELECT
  t.id,
  t.from_lat,
  t.from_lng,
  t.to_lat,
  t.to_lng,
  gs.dt + t.departure_time,   -- date (from GENERATE_SERIES) + time of day (from template)
  t.seats_total,
  ...
FROM ride_templates t
CROSS JOIN GENERATE_SERIES(
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  INTERVAL '1 day'
) AS gs(dt)
WHERE t.deleted_at IS NULL
  AND EXTRACT(DOW FROM gs.dt) = t.weekday  -- weekday filter inside SQL
ON CONFLICT (template_id, departure_at)
  WHERE template_id IS NOT NULL
DO NOTHING;
```

One round-trip regardless of template count or date range. PostgreSQL's executor generates the series, cross-joins with templates, filters by weekday, and skips conflicting rows. The `ON CONFLICT DO NOTHING` clause makes the statement naturally idempotent.

**The unique partial index prerequisite** (migration 033):

```sql
CREATE UNIQUE INDEX rides_template_date_uniq
  ON rides (template_id, departure_at)
  WHERE template_id IS NOT NULL;
```

Without this index, `ON CONFLICT (template_id, departure_at)` has no constraint to target and will error or silently insert duplicates (see [[concepts/on-conflict-constraint-pitfall]]). The `WHERE template_id IS NOT NULL` partial condition avoids indexing manually-created rides without templates.

**Execution time:** At 180k potential rows (2000 users × 3 templates × 30 days), a single well-indexed INSERT...SELECT executes in seconds inside PostgreSQL's executor. The per-round-trip overhead that made the nested loop take minutes is entirely eliminated. The query planner chooses a hash join between GENERATE_SERIES output and ride_templates — O(templates + days) work, not O(templates × days × round-trips).

**Crash recovery:** If the cron process crashes mid-execution, the single SQL either committed (all rows inserted) or rolled back (none). Re-running produces identical results due to `ON CONFLICT DO NOTHING`. The nested loop had partial state: some dates inserted, some not — requiring complex tracking.

## Related Concepts

- [[concepts/bulk-insert-transaction-risk]] — The problem this pattern solves: 180k INSERTs in a single large transaction risk lock timeout; single SQL is not a large transaction — it is one statement
- [[concepts/cron-startup-vs-scheduled-trap]] — Scheduling fix for `expand_templates` (UTCHour guard removal + oncePer + startup run); this article covers the SQL implementation fix
- [[concepts/on-conflict-constraint-pitfall]] — `ON CONFLICT DO NOTHING` requires an explicit unique constraint; migration 033 adds the prerequisite index

## Sources

- [[daily/2026-05-22.md]] — Session 18:15: commit 31f82ea — `apps/cron/src/expand-templates.ts` nested loops (150k × await) replaced by single `INSERT...SELECT...GENERATE_SERIES ON CONFLICT DO NOTHING`; migration 033 added unique partial index `(template_id, departure_at) WHERE template_id IS NOT NULL` as prerequisite; all 895 tests green
