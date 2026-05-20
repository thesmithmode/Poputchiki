---
name: PostgreSQL STABLE Volatility on Encryption Functions
description: STABLE on encrypt_pii lets the query planner cache and reuse ciphertexts within a statement — ECB-like attack at SQL function layer, distinct from app-layer static IV
type: concept
tags: [postgres, security, encryption, pii, sql, volatility]
created: 2026-05-20
updated: 2026-05-20
compiled_from: daily/2026-05-20.md (sector-shared-db review, shared-db-C1)
---

# PostgreSQL STABLE Volatility on Encryption Functions

## Problem

`encrypt_pii(text)` is declared `STABLE`. The query planner is allowed to call a `STABLE` function once per statement and reuse the result for identical inputs. When two rows have the same plaintext value (e.g., two users in the same apartment), the planner may return the same ciphertext for both — identical ciphertexts betray identical plaintexts. This is an ECB-mode property at the SQL function layer, even if the underlying pgcrypto call uses a random IV.

## Distinction from App-Layer Static IV

`encryptpii-static-iv` documents the case where the application hard-codes a static IV when calling the encryption function. This concept documents a different failure mode: the Postgres function itself is marked `STABLE`, allowing the **query planner** to suppress the IV-generating call entirely. The attack surface is at query planning time, not at application call time.

Both vulnerabilities can exist independently. Both must be fixed.

## Why It Matters

PII fields (phone, apt_number) have low cardinality: many residents share the same apartment or phone prefix. An attacker who can read ciphertext values (e.g., via a SQL injection that returns encrypted columns, or a DB dump) can trivially identify matching records without breaking the encryption.

## Root Cause

```sql
-- WRONG
CREATE OR REPLACE FUNCTION encrypt_pii(plaintext text)
RETURNS bytea LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN pgp_sym_encrypt(plaintext, current_setting('app.pgcrypto_key'));
END;
$$;
```

`STABLE` tells Postgres: "same inputs → same output within one statement, safe to memoize." `pgp_sym_encrypt` with a random IV is `VOLATILE` by nature — calling it twice with the same input produces different output each time. Marking its wrapper `STABLE` lies to the planner.

## Fix

```sql
CREATE OR REPLACE FUNCTION encrypt_pii(plaintext text)
RETURNS bytea LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  RETURN pgp_sym_encrypt(plaintext, current_setting('app.pgcrypto_key'));
END;
$$;
```

Change `STABLE` to `VOLATILE`. This prevents the planner from caching results. Performance cost is negligible compared to the security requirement.

## Verification

```sql
-- Should produce two different ciphertexts for same input
SELECT encrypt_pii('test'), encrypt_pii('test');
-- If they match — function is being memoized (STABLE or IMMUTABLE)
```

## Affected Files

- DB migration or `packages/shared/src/db/functions/` — `encrypt_pii` definition

## Related

- [[concepts/encryptpii-static-iv]] — app-layer static IV variant of the same class of encryption bug
- [[concepts/rls-guc-identity]] — GUC-based per-transaction identity, same transaction context
