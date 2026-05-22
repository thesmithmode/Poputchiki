---
title: "postgres.js Boolean Array Wire Type — text[]::boolean[] Cast Required"
aliases: [postgres-js-boolean-array, bool-array-unnest, boolean-array-wire-type]
tags: [database, postgresql, postgres-js, gotcha, typescript]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---

# postgres.js Boolean Array Wire Type — text[]::boolean[] Cast Required

postgres.js sends `boolean` values using a wire protocol type that PostgreSQL does not automatically cast into `boolean[]`. When passing a JavaScript boolean array to a PostgreSQL parameter expecting `boolean[]` — such as in UNNEST batch operations — the query fails or produces wrong results unless the array is explicitly sent as `text[]` and double-cast: `$1::text[]::boolean[]`.

## Key Points

- `${sql.array(boolValues)}::boolean[]` fails: postgres.js wire type for boolean is not auto-cast to `boolean[]` by PostgreSQL
- Correct pattern: `${sql.array(boolValues)}::text[]::boolean[]` — send as text strings, cast to boolean array at SQL level
- Applies to all UNNEST operations that include boolean columns
- Found in `apps/api/src/notifications/notificationsRouter.ts`: UNNEST UPDATE for `notification_preferences.enabled` column
- Commit 2b9f8b8 fixed the CI failure that surfaced this behaviour

## Details

In the Poputchiki `notificationsRouter`, the UNNEST batch UPDATE for notification preferences included a boolean array for the `enabled` field. The original parameter binding used `::boolean[]` which failed silently or with a type mismatch:

```typescript
// WRONG: postgres.js wire type not cast to boolean[] by PG
await sql`
  UPDATE notification_preferences AS np
  SET enabled = t.enabled
  FROM UNNEST(
    ${sql.array(userIds)}::uuid[],
    ${sql.array(categories)}::text[],
    ${sql.array(enabledValues)}::boolean[]   // fails
  ) AS t(user_id, category, enabled)
  WHERE np.user_id = t.user_id AND np.category = t.category
`;

// CORRECT: pass as text[], cast to boolean at SQL level
await sql`
  UPDATE notification_preferences AS np
  SET enabled = t.enabled
  FROM UNNEST(
    ${sql.array(userIds)}::uuid[],
    ${sql.array(categories)}::text[],
    ${sql.array(enabledValues)}::text[]::boolean[]  // works
  ) AS t(user_id, category, enabled)
  WHERE np.user_id = t.user_id AND np.category = t.category
`;
```

The root cause: postgres.js encodes JavaScript `boolean` values using a specific binary wire format. When PostgreSQL receives these as a parameter annotated `::boolean[]`, the type resolution path differs from what it expects — the double-cast `::text[]::boolean[]` forces the values through PostgreSQL's text-to-boolean coercion path, which succeeds.

This is consistent with another known postgres.js type quirk: `BIGINT` columns always return JavaScript `string` values (see [[concepts/postgres-js-isolation-level]]). The library makes type coercion choices that occasionally require explicit SQL-level casts to align with PostgreSQL's expectations.

The fix is mechanical: every `::boolean[]` parameter in UNNEST calls must become `::text[]::boolean[]`. A `sql.array(values)` of booleans becomes `["true", "false", ...]` from PostgreSQL's perspective, then casts cleanly to `boolean[]`.

## Related Concepts

- [[concepts/unnest-batch-update]] — The UNNEST UPDATE pattern where this boolean type issue was discovered; the boolean array is one of the UNNEST columns
- [[concepts/postgres-js-isolation-level]] — Another postgres.js type/syntax gotcha: isolation level string format; both require knowing the library's internal type mapping

## Sources

- [[daily/2026-05-22.md]] — Session 18:35: notificationsRouter UNNEST boolean[] failed CI — postgres.js wire type not auto-cast to PostgreSQL boolean[]; fix: `::text[]::boolean[]` double-cast; commit 2b9f8b8
