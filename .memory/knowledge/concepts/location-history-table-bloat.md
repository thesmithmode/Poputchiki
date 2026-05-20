---
title: "High-Frequency Location History Table Bloat — Range Partitioning Required"
aliases: [location-history-bloat, telemetry-table-bloat, pg-partman, time-series-partition, location-history-partition]
tags: [database, postgresql, performance, scale, architecture, gotcha]
sources:
  - "daily/2026-05-20.md"
created: 2026-05-20
updated: 2026-05-20
---

# High-Frequency Location History Table Bloat — Range Partitioning Required

A `location_history` table that records every position update without partitioning or TTL will grow to hundreds of millions of rows per day at 50k concurrent users. Without partitioning, queries degrade as the table grows, VACUUM struggles to reclaim space, and old data cannot be efficiently dropped. Range partitioning by `created_at` with `pg_partman` for automatic partition management is the correct architecture.

## Key Points

- At 50k users sending position every 5 seconds: 50,000 × (86,400 / 5) = **864M rows/day**
- Single unpartitioned table at this scale: sequential scans dominate even with indexes, VACUUM cannot keep up with dead tuple accumulation
- Range partitioning by `created_at` (weekly partitions) allows instant `DROP PARTITION` for old data vs slow `DELETE` on a single table
- `pg_partman` extension automates partition creation (future) and retention (dropping old) without manual DDL
- Compound index `(user_id, created_at DESC)` required per partition for efficient user history queries

## Details

Location tracking is one of the highest-write workloads in a carpooling app. Each active driver sends GPS coordinates at a regular interval. At 50k concurrent users (the Poputchiki scale target), with a 5-second update interval, the `location_history` table accumulates ~864 million rows per day. Within a week, a single unpartitioned table reaches ~6 billion rows.

At this scale, even well-indexed queries suffer:
- Index maintenance overhead grows proportionally to table size
- PostgreSQL's autovacuum with default settings (3% dead-tuple threshold) is overwhelmed by high-churn write workloads
- `DELETE FROM location_history WHERE created_at < NOW() - INTERVAL '7 days'` is a full-table operation that holds locks and generates WAL proportional to deleted rows

**Range partitioning solution:**

```sql
-- Convert to partitioned table
CREATE TABLE location_history (
  id          BIGSERIAL,
  user_id     UUID NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  accuracy    REAL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Initial partitions (pg_partman will manage future ones)
CREATE TABLE location_history_2026_w21
  PARTITION OF location_history
  FOR VALUES FROM ('2026-05-18') TO ('2026-05-25');

CREATE TABLE location_history_2026_w22
  PARTITION OF location_history
  FOR VALUES FROM ('2026-05-25') TO ('2026-06-01');

-- Index per partition (or on parent — PostgreSQL 11+ propagates to children)
CREATE INDEX location_history_user_time_idx
  ON location_history (user_id, created_at DESC);
```

**pg_partman configuration (PostgreSQL extension):**

```sql
-- Install pg_partman
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- Configure automatic weekly partition management with 4-week retention
SELECT partman.create_parent(
  p_parent_table   => 'public.location_history',
  p_control        => 'created_at',
  p_type           => 'range',
  p_interval       => '1 week',
  p_retention      => '4 weeks',           -- auto-drop partitions older than 4 weeks
  p_retention_keep_table => false          -- actually drop (not just detach)
);
```

The `pg_partman` background worker (or a cron job calling `partman.run_maintenance()`) handles:
- Creating future partitions before they are needed (prevents "no partition found" insert failures)
- Dropping partitions older than the retention window (instant DDL, no locking, no WAL)

**When partitioning is NOT the answer:** If only the most recent position per user matters (real-time tracking, not history), consider an alternative architecture:
- A `user_locations` table with one row per user (UPSERT on each update) — O(users) size, not O(updates × users)
- Write the raw history to a WAL-tailed stream or Kafka topic and drop it from PostgreSQL after replication

For Poputchiki, route replay and history visualization require the history, so partitioned PostgreSQL is appropriate.

## Related Concepts

- [[concepts/self-hosted-postgres]] — Self-hosted PostgreSQL 16 where pg_partman is installed; managed services may offer native time-series partitioning
- [[concepts/deployment-pipeline]] — `pg_partman` extension must be in the CI PostgreSQL setup step, not just the Docker init scripts (see `ci-env-vs-docker-init`)
- [[concepts/sse-pool-connection-ceiling]] — Both this concept and location history bloat are scale-at-50k architectural issues; both require pre-production architectural changes before reaching the scale target

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-db-review finding #3 HIGH: `location_history` writes every 5s without partition/TTL → 864M rows/day at 50k users; fix: range partitioning by `created_at` (weekly) + `pg_partman` for auto-drop; sector-api-review finding #5 corroborated
