---
title: "ON CONFLICT DO NOTHING Without Unique Constraint"
aliases: [on-conflict-constraint, upsert-silent-bug, where-not-exists, on-conflict-pitfall]
tags: [database, postgresql, gotcha, sql]
sources:
  - "daily/2026-05-04.md"
created: 2026-05-04
updated: 2026-05-04
---

# ON CONFLICT DO NOTHING Without Unique Constraint

`ON CONFLICT DO NOTHING` requires a unique constraint or unique index to detect conflicts. Without one, the behavior is either silently wrong (no conflict target specified) or a runtime error (conflict target column specified). The safe fallback for logical uniqueness without a schema constraint is `WHERE NOT EXISTS`.

## Key Points

- `INSERT ... ON CONFLICT DO NOTHING` with no target clause: inserts unconditionally — no constraint means PostgreSQL never detects a conflict
- `INSERT ... ON CONFLICT (col) DO NOTHING` with no unique index on `col`: PostgreSQL raises `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification`
- Both are wrong for different reasons: one is silent data corruption, one is a runtime error
- Safe alternative without a constraint: `INSERT INTO tbl (...) SELECT ... WHERE NOT EXISTS (SELECT 1 FROM tbl WHERE condition)`
- If uniqueness is a business rule, add the actual unique constraint and keep `ON CONFLICT` — `WHERE NOT EXISTS` is non-atomic

## Details

The bug was introduced in TASK-076 (soft-delete + anonymize_user): `ON CONFLICT DO NOTHING` was written to prevent duplicate entries, but no corresponding unique constraint existed in the schema. The intent was to guard idempotent inserts, but because the constraint was absent, the conflict clause never triggered — every invocation inserted a new row.

Discovery was made during code review before merging to `dev`. The fix replaced `ON CONFLICT DO NOTHING` with a `WHERE NOT EXISTS` subquery:

```sql
-- WRONG: no unique constraint → always inserts
INSERT INTO anonymized_users (user_id, anonymized_at)
VALUES ($1, NOW())
ON CONFLICT DO NOTHING;

-- CORRECT: subquery guard without constraint requirement
INSERT INTO anonymized_users (user_id, anonymized_at)
SELECT $1, NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM anonymized_users WHERE user_id = $1
);
```

The `WHERE NOT EXISTS` pattern is non-atomic (check-then-act), meaning two concurrent callers can both pass the check before either inserts. For use cases requiring strict idempotency under concurrency, the correct fix is to add the unique constraint and use `ON CONFLICT`. For use cases where duplicate protection is best-effort (e.g., anonymization is idempotent by nature), `WHERE NOT EXISTS` is sufficient.

Before writing any `ON CONFLICT` clause, verify the constraint exists: `\d tablename` in psql or check the relevant migration file. The absence of a unique constraint is not always obvious in code review — the statement compiles and runs without error when no target column is specified.

## Related Concepts

- [[concepts/self-hosted-postgres]] - PostgreSQL 16 context; constraint enforcement and upsert semantics
- [[concepts/advisory-lock-pool-safety]] - Related idempotency concern: advisory locks guard critical sections; ON CONFLICT guards idempotent inserts — both require correct infrastructure to work
- [[concepts/auth-security-vulnerabilities]] - Idempotency race condition in auth middleware follows the same check-then-act pattern; `ON CONFLICT` with a real constraint is the atomic fix

## Sources

- [[daily/2026-05-04.md]] - Session 09:48: `ON CONFLICT DO NOTHING` in TASK-076 removed — no unique constraint existed on target column; replaced with `WHERE NOT EXISTS` subquery guard; found during code review before merge to `dev`
