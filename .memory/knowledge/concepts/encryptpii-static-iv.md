---
title: "Static IV in PII Encryption — ECB-Like Vulnerability"
aliases: [static-iv, encryptPII-iv, aes-static-iv, ecb-attack-pgcrypto]
tags: [security, cryptography, pii, gotcha, critical]
sources:
  - "daily/2026-05-20.md"
created: 2026-05-20
updated: 2026-05-20
---

# Static IV in PII Encryption — ECB-Like Vulnerability

Using a static (zero-filled) initialization vector in AES/pgcrypto PII encryption causes identical plaintexts to produce identical ciphertexts. This creates an ECB-like vulnerability: an attacker who observes encrypted columns can detect duplicate values (e.g., two users with the same phone number) through frequency analysis without decrypting anything.

## Key Points

- `Buffer.alloc(16, 0)` as IV → same plaintext + same IV + same key = same ciphertext every time
- Frequency analysis: attacker sees `enc_phone = X` on 1000 rows → infers many users share phone (or just that it's the same person)
- Correct IV: `crypto.randomBytes(16)` per encryption call, prepended to the ciphertext and stripped on decryption
- The IV does not need to be secret — it must only be unique (unpredictable) per encryption operation
- PostgreSQL pgcrypto functions also require correct IV usage — `pgp_sym_encrypt` with static IV has the same problem

## Details

Symmetric encryption (AES-CBC, AES-GCM) is secure only when the initialization vector is unique for each encryption operation. The IV is not a secret — it is typically stored alongside the ciphertext — but it must be randomly generated per call. When a static IV is used, the cipher degrades: if two plaintexts are identical, their ciphertexts are identical, revealing that the underlying data matches without decrypting either.

The vulnerable pattern in `packages/shared/src/utils/crypto.ts`:

```typescript
// WRONG: static IV
const IV = Buffer.alloc(16, 0); // all zeros

export function encryptPII(plaintext: string, key: string): string {
  const cipher = crypto.createCipheriv("aes-256-cbc", key, IV);
  return cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
}
```

The correct pattern with random IV prepended:

```typescript
// CORRECT: random IV per encryption
export function encryptPII(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted; // IV:ciphertext
}

export function decryptPII(stored: string, key: Buffer): string {
  const [ivHex, ciphertext] = stored.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return decipher.update(ciphertext, "hex", "utf8") + decipher.final("utf8");
}
```

The format change (`iv:ciphertext` instead of bare ciphertext) requires a data migration for existing encrypted rows: re-read, decrypt with the old static IV, re-encrypt with a fresh random IV. Since this changes the stored format, column values must be updated atomically.

**Practical attack scenario for Poputchiki:** The `phone` column is encrypted. If two users share a phone (possible in shared-device households) or the same user appears multiple times, the attacker sees identical encrypted values without needing the key. More importantly, uniqueness of the encrypted value leaks the uniqueness of the phone number — a privacy violation even without decryption.

**pgcrypto note:** `pgp_sym_encrypt(phone, key)` uses a random session key internally and is not affected by this bug. The vulnerability is in custom AES encryption in application code that reuses a static IV. Verify which encryption path is actually used for each PII column.

## Related Concepts

- [[concepts/self-hosted-postgres]] — pgcrypto PII encryption is a core feature of the self-hosted Postgres setup; this bug affects the application-layer encryption above the DB
- [[concepts/rls-guc-identity]] — RLS protects row access; encryption protects column data even if rows are accessed — both layers must be correct
- [[concepts/auth-security-vulnerabilities]] — Same category: cryptographic security bugs found in code review; static IV is in the same severity class as JWT session fixation

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-shared-review finding #2 CRITICAL: `encryptPII` uses `Buffer.alloc(16, 0)` as static IV → ECB-like vulnerability → same plaintext = same ciphertext → frequency analysis possible; fix: `crypto.randomBytes(16)` prepended to ciphertext
