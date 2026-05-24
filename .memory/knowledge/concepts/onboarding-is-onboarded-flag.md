---
title: "Onboarding Flow — WelcomeScreen + is_onboarded Flag"
aliases: [onboarding-flow, is-onboarded, welcome-screen, profile-setup-redirect]
tags: [frontend, backend, ux, pattern, authentication]
sources:
  - "daily/2026-05-24.md"
created: 2026-05-24
updated: 2026-05-24
---

# Onboarding Flow — WelcomeScreen + is_onboarded Flag

New Telegram Mini App users go through a one-time onboarding sequence: WelcomeScreen (logo animation) → ProfileSetupScreen (name, phone, apartment, role). The `is_onboarded` boolean flag in `users` table tracks completion. Already-registered users skip the wizard entirely.

## Key Points

- `users.is_onboarded` boolean: false on registration, set to true when `PATCH /users/profile` completes the wizard
- App.tsx routing guard: `if (!user.is_onboarded)` → navigate to WelcomeScreen; otherwise render main tabs
- `ProfileSetupScreen` after final step calls `navigate("/")` (or the main feed route) — handled by the routing guard
- WelcomeScreen is a transient animated screen, not a persistent route — no back button
- Skip logic: `useMe` returns `user.is_onboarded = true` → routing guard never shows onboarding screens

## Details

Telegram Mini App users arrive via `initData` from the Telegram client. On first open, the user is created in the DB with `is_onboarded = false`. The `useMe` hook authenticates and returns the user profile including the flag.

**Routing guard in App.tsx:**

```typescript
const { user } = useMe();

if (!user) return <Spinner />;
if (!user.is_onboarded) return <WelcomeScreen />;

return <MainTabs />;
```

The guard uses the `is_onboarded` field directly from the API response — no separate "onboarding state" in React context needed.

**WelcomeScreen flow:**

```typescript
export function WelcomeScreen() {
  const navigate = useNavigate();

  return (
    <div className="welcome">
      <Logo animated />
      <h1>Попутчики Царёво</h1>
      <button onClick={() => navigate("/profile/setup")}>
        Начать
      </button>
    </div>
  );
}
```

WelcomeScreen does not check `is_onboarded` itself — the routing guard already ensured only un-onboarded users see it.

**API: set `is_onboarded = true` on profile completion:**

```typescript
// apps/api/src/routes/users.ts — PATCH /users/profile
router.patch("/profile", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const { name, phone, apt_number, role } = await c.req.json();

  await sql`
    UPDATE users
    SET
      name = ${name},
      phone_encrypted = encrypt_pii(${phone}),
      apt_number_encrypted = encrypt_pii(${apt_number}),
      role = ${role},
      is_onboarded = true      -- always set on profile completion
    WHERE id = ${userId}
  `;

  return c.json({ ok: true });
});
```

Setting `is_onboarded = true` unconditionally in the profile PATCH means re-submitting profile settings (from the ProfileScreen later) is safe — the flag is idempotent.

**ProfileSetupScreen completion:**

```typescript
const onComplete = async () => {
  await submitProfile(formData);
  navigate("/"); // routing guard will now show MainTabs
};
```

After `PATCH /users/profile` the `useMe` cache is invalidated, the flag becomes `true` in the next fetch, and the guard renders the main app. The user sees the feed without an explicit redirect.

## Related Concepts

- [[concepts/useme-auth-flow]] — `useMe` provides the `is_onboarded` field that drives the routing guard; flag reads from the same user profile fetch
- [[concepts/rls-guc-identity]] — Profile PATCH runs inside a transaction with GUC identity set; RLS ensures users can only update their own profile
- [[concepts/telegram-hashrouter-tgwebappdata]] — Hash cleanup must run before mount; the routing guard executes after hash cleanup and `useMe` initialization

## Sources

- [[daily/2026-05-24.md]] — Session 21:25: TASK-113 onboarding flow: WelcomeScreen created, ProfileSetupScreen completes with `navigate("/")`, `PATCH /users/profile` sets `is_onboarded = true`; App.tsx routing guard `if (!user.is_onboarded)` controls flow
