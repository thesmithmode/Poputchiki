# Codex review (duplication, security, code quality)

## Scope
- `packages/shared/src`
- `saas/one-shot-¦¬¦--TВTГ¦¬¦-¦-TГ/billion-dollar-saas/app/api`

## Findings

### 1) Security: weak fail-fast for Stripe secrets
Both API handlers initialize Stripe with `process.env.STRIPE_SECRET_KEY || ""`, and webhook secret also falls back to empty string. This can let misconfiguration survive until runtime request path, producing avoidable 500/400 behavior instead of deterministic startup failure.

**Risk:** medium (misconfiguration + noisy runtime failure path).

**Recommendation:** validate required Stripe env vars once at startup (e.g., zod/env module), throw if absent.

### 2) Security/logic: subscription period is derived from `expires_at` on checkout session
In webhook handler, `currentPeriodEnd` is set from `session.expires_at` (or synthetic +30 days fallback). `expires_at` is checkout-session expiration, not billing-cycle period end; this can grant/revoke access at incorrect time.

**Risk:** high (incorrect entitlement period).

**Recommendation:** on `checkout.session.completed`, fetch the Stripe subscription object by `session.subscription` and use `current_period_end`.

### 3) Security/reliability: missing idempotency handling for webhook events
Webhook handler processes events without storing/checking `event.id`. Retries from Stripe can trigger repeated updates and race conditions.

**Risk:** medium.

**Recommendation:** persist processed event IDs (or use upsert with event id uniqueness) and skip duplicates.

### 4) Duplication: Stripe client bootstrap duplicated across handlers
Both `checkout` and `webhooks` routes duplicate Stripe client initialization with same API version.

**Recommendation:** centralize in `lib/stripe.ts` with env validation and shared singleton.

### 5) Code quality: duplicated env-parse error formatting
`parseWebhookEnv` and `parseApiEnv` contain identical error rendering logic.

**Recommendation:** extract helper `formatZodIssues(error)` and reuse in both parsers.

### 6) Input sanitization quality: `stripHtml` is regex-based
`stripHtml` removes tags with regex. This is easy to bypass for malformed HTML and can silently mangle text. 

**Risk:** low-to-medium (depends on where output is rendered).

**Recommendation:** if security-sensitive HTML sanitization is needed, use a dedicated sanitizer (DOMPurify/sanitize-html) and context-aware escaping on render.
