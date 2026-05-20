---
title: "UserPublic / UserInternal Type Split — Prevent PII Leakage via Shared Types"
aliases: [userpublic-userinternal, pii-type-split, user-public-type, api-response-pii]
tags: [security, typescript, pii, api, pattern]
sources:
  - "daily/2026-05-20.md"
created: 2026-05-20
updated: 2026-05-20
---

# UserPublic / UserInternal Type Split — Prevent PII Leakage via Shared Types

A single `User` type in `packages/shared` that includes `phone` and `apt_number` fields is accidentally used in API response serialization, leaking PII to all callers. The fix is two distinct types: `UserInternal` (with encrypted PII fields, for DB layer) and `UserPublic` (no PII, for API responses). API routes must only use `UserPublic`.

## Key Points

- `User` type with `phone: string` used as API response type → every `/users/me` response includes the raw phone number even if the client doesn't need it
- Encrypted fields are even worse: returning `phone: "encrypted_hex_blob"` leaks that a phone number exists and gives the attacker material to attack the key
- `UserPublic` — fields safe for any authenticated caller: `id`, `name`, `tg_id`, `avatar_url`, `role`, `created_at`
- `UserInternal` — includes `phone_encrypted`, `apt_number_encrypted`, `pgcrypto_key_hint` — only used in service-layer code, never serialized to HTTP
- TypeScript enforces the boundary: API route handlers accept `UserPublic` return type; functions that need PII explicitly request `UserInternal`

## Details

The type pollution problem: `packages/shared/src/types/index.ts` exports a `User` type used throughout the codebase. When an API route handler fetches a user and returns `c.json(user)`, it serializes whatever fields the `User` type has. If `User.phone` is included, it appears in the HTTP response body.

```typescript
// packages/shared/src/types/user.ts

/** Safe for HTTP responses — no PII fields */
export interface UserPublic {
  id: string;
  tg_id: string;
  name: string;
  avatar_url: string | null;
  role: "driver" | "passenger" | "admin";
  created_at: string;
  banned_at: string | null;
}

/** Full user record — only for service-layer code, never serialized to HTTP */
export interface UserInternal extends UserPublic {
  phone_encrypted: string | null;     // pgcrypto encrypted
  apt_number_encrypted: string | null;
  notify_disabled: boolean;
  deleted_at: string | null;
}
```

API route handlers declare their return type as `UserPublic`:

```typescript
// apps/api/src/routes/users.ts
router.get("/me", async (c) => {
  const userId = c.get("userId");
  const user = await getUserPublic(sql, userId); // returns UserPublic
  return c.json(user satisfies UserPublic);
});

async function getUserPublic(sql: Sql, userId: string): Promise<UserPublic> {
  const [user] = await sql<UserPublic[]>`
    SELECT id, tg_id, name, avatar_url, role, created_at, banned_at
    FROM users
    WHERE id = ${userId}
      AND deleted_at IS NULL
  `;
  return user;
}
```

By selecting only the public columns in the query, PII fields are never loaded into memory on the response path.

Internal operations (sending TG notifications, processing payment, admin lookup) use `UserInternal` explicitly:

```typescript
async function getUserInternal(sql: Sql, userId: string): Promise<UserInternal> {
  const [user] = await sql<UserInternal[]>`
    SELECT *, pgp_sym_decrypt(phone_encrypted, ${key}) AS phone
    FROM users WHERE id = ${userId}
  `;
  return user;
}
```

**Type duplication across the codebase:** The DB review found `User`, `Trip`, `Passenger` types duplicated in `web/src/types/`, `apps/api/src/types/`, and `packages/shared/src/types/`. All imports should come from `@poputchiki/shared` exclusively. Local copies drift silently — a field added to the shared `UserPublic` is not reflected in the local `web/src/types/users.ts` until someone manually syncs them.

The `UserPublic` / `UserInternal` split also protects against the `SELECT *` antipattern: if a `SELECT *` accidentally fetches all columns, the TypeScript type prevents the encrypted fields from leaking because the result is typed as `UserPublic` which does not have those fields. The fields are present in the SQL result but not accessible through the typed interface.

## Related Concepts

- [[concepts/encryptpii-static-iv]] — The encryption that protects PII fields in `UserInternal`; both the encryption correctness and the type split are required for PII protection
- [[concepts/rls-guc-identity]] — RLS limits which rows are returned; type split limits which columns are included in responses — complementary security layers
- [[concepts/auth-security-vulnerabilities]] — PII leakage via API response is in the same severity class as the auth bugs; both are exploitable without cryptographic attack

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-shared-review finding #3 CRITICAL: `User` тип экспортирует `phone` и `apt_number` как plaintext → утечка PII через API response; finding #4 HIGH: типы дублируются в web/api/shared → 3 источника правды; fix: `UserPublic` (без PII) и `UserInternal` (с encrypted полями); API routes только `UserPublic`
