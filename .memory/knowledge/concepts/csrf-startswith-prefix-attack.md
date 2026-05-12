---
title: "CSRF Origin Check startsWith Prefix Attack"
aliases: [csrf-startswith, origin-prefix-attack, csrf-domain-bypass, origin-validation]
tags: [security, csrf, web, gotcha]
sources:
  - "daily/2026-05-08.md"
created: 2026-05-08
updated: 2026-05-08
---

# CSRF Origin Check startsWith Prefix Attack

Using `String.startsWith()` for CSRF origin validation allows an attacker to register a domain that starts with the legitimate origin as a prefix. A check like `origin.startsWith("https://app.example.com")` passes for both the legitimate origin and `https://app.example.com.attacker.com`.

## Key Points

- `origin.startsWith("https://app.poputchiki.domain")` → passes for `https://app.poputchiki.domain.attacker.com`
- Attacker registers `app.poputchiki.domain.attacker.com` or `app.poputchiki.domainX.com` → CSRF protection bypassed
- Correct check: exact equality `origin === "https://app.poputchiki.domain"` or allowlist comparison
- For multiple allowed origins: `["https://app.example.com", "https://www.example.com"].includes(origin)`
- Never use `startsWith`, `includes`, or regex anchored only at start for origin validation

## Details

CSRF protection relies on verifying that cross-origin requests originate from trusted domains. The Origin header (sent by browsers for POST/PUT/DELETE) contains the scheme+host+port of the page making the request. The check is:

```typescript
// WRONG — startsWith prefix attack
if (!origin.startsWith("https://app.poputchiki.searchingforgamesforever.online")) {
  return c.json({ error: "Forbidden" }, 403);
}

// CORRECT — exact equality
const ALLOWED_ORIGINS = new Set([
  "https://app.poputchiki.searchingforgamesforever.online",
  "https://poputchiki.searchingforgamesforever.online",
]);
if (!ALLOWED_ORIGINS.has(origin)) {
  return c.json({ error: "Forbidden" }, 403);
}
```

The prefix attack is straightforward: an attacker hosts a page at `https://app.poputchiki.searchingforgamesforever.online.attacker.com`. When a victim visits that page, the browser sends `Origin: https://app.poputchiki.searchingforgamesforever.online.attacker.com`. The `startsWith` check passes because the legitimate domain is a prefix of the attacker's domain. A cross-origin POST to the legitimate API is then treated as trusted.

A secondary related issue from the same code review: webhook secret comparison was done with regular string equality (`===`). String equality in JavaScript is non-constant-time — it short-circuits on the first mismatched character. A timing oracle attack could extract the webhook secret byte by byte. The fix is `crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expectedSecret))`.

## Related Concepts

- [[concepts/auth-security-vulnerabilities]] - Related class of auth/security bugs found in Poputchiki code review; CSRF is a new category added by 2026-05-08 review
- [[concepts/poputchiki-stack]] - Hono backend where CSRF middleware resides

## Sources

- [[daily/2026-05-08.md]] - Session 09:28: CSRF origin check used `startsWith` → domain prefix attack (`app.example.com.attacker.com` passes); webhook secret comparison non-constant-time; both classified as security release blockers; fixes: exact equality for origin, `crypto.timingSafeEqual` for webhook secret
