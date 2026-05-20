---
title: "location_history Partitioning — Unbounded Growth at 50k Users"
aliases: [location-history-bloat, location-partitioning, pg-partman-location, location-history-ttl]
tags: [database, postgresql, performance, scale, gotcha]
sources:
  - "daily/2026-05-20.md"
created: 2026-05-20
updated: 2026-05-20
---

# location_history Partitioning — Unbounded Growth at 50k Users

Without table partitioning or a TTL policy, `location_history` written every 5 seconds per active user accumulates 864 million rows per day at 50,000 concurrent users. This will exhaust disk and degrade all queries on the table within days of reaching production scale.

## Key Points

- 50k users × 17,280 writes/day (every 5s) = **864 million rows/day** in `location_history`
- No partition = single table scan for history queries, growing unboundedly
- Fix: range partitioning by `created_at` (weekly) + `pg_partman` extension for automatic old-partition dropping
- Autovacuum defaults are insufficient at 10M+ rows/hour — explicit `VACUUM ANALYZE` schedule required
- Queries like "where was user X at time T?" need `(user_id, created_at DESC)` compound index on each partition

## Details

Location tracking writes one row per user per interval. At 5-second intervals:

```
50,000 users × (86,400 seconds / 5 seconds) = 50,000 × 17,280 = 864,000,000 rows/day
```

Without partitioning, a single `location_history` table accumulates this data indefinitely. PostgreSQL autovacuum defaults (triggered at 20% dead tuples or 50 rows threshold) are designed for tables with modest churn — they cannot keep pace with 10M+ inserts per hour. Dead tuple accumulation leads to table bloat, slowing all scans further.

**Partitioning solution using `pg_partman`:**

```sql
-- Create partitioned table
CREATE TABLE location_history (
  id          BIGSERIAL,
  user_id     UUID NOT NULL,
  lat         DECIMAL(9,6) NOT NULL,
  lng         DECIMAL(9,6) NOT NULL,
  accuracy    FLOAT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- pg_partman manages weekly partitions automatically
SELECT partman.create_parent(
  p_parent_table  => 'public.location_history',
  p_control       => 'created_at',
  p_type          => 'range',
  p_interval      => 'weekly',
  p_premake       => 2   -- create 2 future partitions in advance
);

-- Configure retention: drop partitions older than 30 days
UPDATE partman.part_config
SET retention = '30 days', retention_keep_table = false
WHERE parent_table = 'public.location_history';
```

`pg_partman`'s maintenance function (`partman.run_maintenance()`) must be scheduled via cron or pg_cron to run periodically (e.g., every hour) to create new partitions and drop old ones.

**Required indexes per partition:**

```sql
-- Each partition inherits this index via the parent index
CREATE INDEX location_history_user_time_idx
  ON location_history (user_id, created_at DESC);
```

PostgreSQL automatically creates this index on each child partition when defined on the parent in PostgreSQL 11+.

**Alternative: WAL-based approach.** For highest-throughput location writes, consider a write-ahead buffer (Redis sorted set per user, flushed to DB in batches every 30s). This reduces insert rate by 6× while maintaining history granularity. Partitioning is still needed for the DB table, but write pressure decreases significantly.

**Autovacuum tuning for high-write tables:**

```sql
ALTER TABLE location_history SET (
  autovacuum_vacuum_scale_factor = 0.01,  -- trigger at 1% dead tuples (not 20%)
  autovacuum_analyze_scale_factor = 0.005,
  autovacuum_vacuum_cost_delay = 2ms      -- more aggressive vacuum
);
```

The same partitioning need applies to the `messages` table (mentioned in the DB review) and any other unbounded-growth append-only table.

## Related Concepts

- [[concepts/sse-pool-connection-ceiling]] — Co-scale concern: SSE connections also hit a ceiling at 50k users; location tracking is the write-side scale problem
- [[concepts/self-hosted-postgres]] — Self-hosted Postgres 16 is the target; pg_partman is available as an extension and must be installed via init scripts
- [[concepts/ci-env-vs-docker-init]] — pg_partman extension must be installed in both Docker init scripts AND CI PostgreSQL setup step, following the same pattern as pgcrypto

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-db-review finding #3 HIGH: `location_history` pишется каждые 5с без partition/TTL → 864M строк/сутки при 50k users; sector-infra-review: autovacuum дефолтный недостаточен при 10M+ rows/hr; fix: range partition по `created_at` (weekly) + pg_partman auto-drop
