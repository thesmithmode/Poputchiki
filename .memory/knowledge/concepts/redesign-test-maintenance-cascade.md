---
title: "Frontend Redesign Test Maintenance Cascade"
aliases: [redesign-test-cascade, aria-label-sync, test-cascade-redesign, biome-empty-lines-after-deletion]
tags: [testing, frontend, discipline, workflow, biome]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# Frontend Redesign Test Maintenance Cascade

A UI redesign — changing component hierarchy, promoting routes, removing features — triggers a cascade of test failures that are not bugs but stale assertions. The cascade includes: aria-label mismatches, removed feature tests, changed route semantics, and Biome formatting violations after test block deletions.

## Key Points

- Renaming or restructuring a component changes `aria-label` values → `getByRole("button", { name: "..." })` tests fail with "element not found"
- Removing a feature (e.g., map toggle, back button) requires deleting its tests AND cleaning up formatting artifacts (empty lines between remaining tests)
- Biome linter flags consecutive empty lines left behind after deleting test blocks — CI fails on lint, not on test logic
- Promoting a route from child to tab (e.g., `/map` from child of FeedScreen to BottomTabBar tab) changes test expectations: no back button, different navigation behavior
- Each type of failure appears in a different CI job (unit tests, lint, typecheck) — all must be fixed in one batch before push

## Details

During the Poputchiki v2 design implementation on 2026-05-14, the MapScreen was promoted from a child route (accessible via a toggle in FeedScreen header) to a dedicated tab in the bottom navigation bar. This single architectural change triggered four categories of test maintenance:

**1. Removed feature tests:** The "Карта/Список" toggle in FeedScreen's header was removed. `FeedScreen.test.tsx` had tests verifying the toggle's presence and behavior. These tests now fail because the toggle element no longer exists in the rendered output. Fix: delete the toggle tests entirely.

**2. Removed navigation tests:** As a child route, MapScreen had a back button to return to the feed. As a tab, there is no back button — navigation is via the tab bar. `MapScreen.test.tsx` had tests for the back button. Fix: delete back button tests.

**3. Biome formatting after deletion:** After deleting test blocks from `.test.tsx` files, consecutive empty lines remain where the blocks used to be. Biome's `noConsecutiveBlankLines` rule flags these as lint errors. Fix: run `bun run format` (Biome) after every test block deletion, before committing.

**4. Aria-label synchronization:** Redesigned components use different text labels (e.g., "Профиль" instead of "Настройки" for the profile tab). Tests using `getByRole` with the old label string fail. Fix: update all label strings in tests to match the new UI text.

The cascade cost on 2026-05-14 was 3+ CI failures, each revealing a different category. The reactive fix loop (fix tests → push → Biome fails → fix formatting → push → another test fails) mirrors the deployment fix loop pattern — the correct approach is to audit all test files touching redesigned components before the first push.

**Pre-push checklist for UI redesigns:**
1. Search all `.test.tsx` files for `aria-label`, `getByRole`, `getByText` references to changed/removed elements
2. Delete tests for removed features; update assertions for renamed/restructured features
3. Run `bun run format` to fix Biome formatting after test deletions
4. Run `bun run lint` + `bun run typecheck` locally before push
5. Verify test count hasn't dropped unexpectedly (legitimate deletions are fine; accidental removals are not)

## Related Concepts

- [[concepts/batch-ci-fix-discipline]] - Same anti-pattern: reactive push→fail→fix loop; audit all failure surfaces before first push
- [[concepts/leaflet-css-zero-height]] - Co-occurring with MapScreen redesign in the same session; CSS import discovery happened during the same tab promotion work
- [[concepts/test-assertion-contract-drift]] - Related test maintenance issue: assertions drift when implementation changes; redesign is a bulk trigger for this drift

## Sources

- [[daily/2026-05-14.md]] - Session 17:11: MapScreen promoted from child route to tab → back button tests deleted, map toggle tests deleted, Biome flagged empty lines after deletions; aria-labels updated for new tab names ("Профиль" replacing "Настройки"); 3+ CI failures from reactive fix loop
- [[daily/2026-05-14.md]] - Session 17:45: SettingsScreen → ProfileScreen rename; FeedScreen map toggle removal; further test cascade from the same redesign
