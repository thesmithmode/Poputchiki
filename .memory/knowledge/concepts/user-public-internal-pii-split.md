---
title: "UserPublic / UserInternal PII Type Split"
aliases: [userpublic-userinternal, pii-type-split, api-response-pii-leak, user-type-pii, public-internal-types]
tags: [security, pii, typescript, architecture, pattern, critical]
sources:
  - "daily/2026-05-20.md"
created: 2026-05-20
updated: 2026-05-20
---

# UserPublic / UserInternal PII Type Split

A shared `User` TypeScript type that includes `phone` and `apt_number` as plaintext string fields will cause PII leakage if used directly in API responses. Any route that serializes this type to JSON exposes raw PII to the client. The fix is two distinct types: `UserInternal` (full data, used server-side only) and `UserPublic` (masked/absent PII fields, safe to serialize to API responses).

## Key Points

- `packages/shared/src/types/index.ts` `User` type with `phone: string` and `apt_number: string` → any route returning `User` exposes PII in plaintext
- The type itself does not distinguish "this is encrypted bytes" from "this is a phone number string" — both are `string` in TypeScript
- `UserPublic` — fields visible to the client: `id`, `name`, `avatar_url`, `role`, `tg_id` (masked or absent for phone/apt)
- `UserInternal` — server-side type including encrypted PII fields; never serialized to HTTP responses
- API route handlers must only construct and return `UserPublic` — TypeScript enforces this at compile time if types are correct

## Details

The vulnerability is structural: a shared type used both server-side (where PII fields hold encrypted bytes or plaintext after decryption) and client-facing (where the same type is JSON-serialized into API responses). If a developer writes:

```typescript
// WRONG: returns full User including phone, apt_number
router.get("/users/:id", async (c) => {
  const user = await getUserById(id); // returns User with all fields
  return c.json(user);               // PII in API response
});
```

The fix is two type levels:

```typescript
// packages/shared/src/types/user.ts

/** All fields — never serialize to API response */
export interface UserInternal {
  id: string;
  tg_id: string;
  name: string;
  avatar_url: string | null;
  role: "driver" | "passenger" | "admin";
  phone_encrypted: string;      // pgcrypto ciphertext — not "phone"
  apt_number_encrypted: string; // pgcrypto ciphertext
  banned_at: Date | null;
  deleted_at: Date | null;
  notify_disabled: boolean;
  created_at: Date;
}

/** Safe to serialize — no PII */
export interface UserPublic {
  id: string;
  tg_id: string;
  name: string;
  avatar_url: string | null;
  role: "driver" | "passenger" | "admin";
  // phone and apt_number intentionally absent
}

/** Profile owner sees their own masked data */
export interface UserProfile extends UserPublic {
  phone_masked: string;      // "+7 (***) ***-12-34"
  apt_number_masked: string; // "**4"
  notify_disabled: boolean;
}
```

Route handlers explicitly project to the public type:

```typescript
function toPublic(user: UserInternal): UserPublic {
  return {
    id: user.id,
    tg_id: user.tg_id,
    name: user.name,
    avatar_url: user.avatar_url,
    role: user.role,
  };
}

router.get("/users/:id", async (c) => {
  const user = await getUserById(id); // UserInternal
  return c.json(toPublic(user));      // UserPublic — TypeScript enforces this
});
```

**Naming the encrypted fields `phone_encrypted` (not `phone`)** serves a dual purpose: it documents that the column holds ciphertext, and it prevents accidental direct use in API responses — returning `user.phone_encrypted` to the client sends incomprehensible bytes, not a real phone number. The plaintext is only available after explicit decryption, which must be done in a controlled context.

**Masking for the profile owner:** The authenticated user can see their own data, but should see a masked version (not raw plaintext after decryption) for display purposes. `+7 (***) ***-12-34` is sufficient for the user to confirm it's their number; it does not expose the number to XSS attacks on the client or to other clients that might receive the same API response through a bug.

**Impact of missing this split:** Any route that accidentally returns `UserInternal` (or the old flat `User` type) through a serializer will expose phone numbers and apartment numbers of every user in the response. This is a privacy regulation violation under Russia's Federal Law 152-FZ ("On Personal Data").

## Related Concepts

- [[concepts/self-hosted-postgres]] — PII is encrypted at rest via `pgcrypto`; the type split ensures the decrypted form is controlled server-side only
- [[concepts/encryptpii-static-iv]] — Static IV vulnerability in the encryption of these same PII fields; both the encryption bug and the type split are required for correct PII handling
- [[concepts/rls-guc-identity]] — RLS controls row-level access; the type split controls field-level access in API responses — complementary layers
- [[concepts/auth-security-vulnerabilities]] — PII leakage through API responses is in the same category as auth security bugs; both are pre-production required fixes

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-shared-review finding #3 CRITICAL: `User` shared type exposes `phone` and `apt_number` as plaintext strings → PII leak if used in API responses; fix: `UserPublic` (no PII) and `UserInternal` (encrypted fields, server-only); API routes must only return `UserPublic`
