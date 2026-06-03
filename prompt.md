The current migration is in a good state.

IMPORTANT: This is NOT a redesign task.

The current UI, styling, spacing, colors, typography, layouts, component structure, and interactions look correct. Do not refactor, modernize, restyle, or reorganize anything that is already working.

Only address the issues listed below.

## Critical Rules

* Do not change any existing UI.
* Do not change layouts.
* Do not change spacing.
* Do not change colors.
* Do not change typography.
* Do not replace components.
* Do not restructure pages.
* Do not modify working screens.
* Treat the current UI as approved and locked.

Any visual change outside the requested fixes should be considered a bug.

---

## Fix 1: Blank Screens

Some pages are rendering blank or partially blank.

Specifically investigate:

* Patient Details page (`/patients/[id]`)
* Checkout page (`/checkout/[id]`)

Requirements:

* Compare these pages against the original prototype source files.
* Restore all missing sections, cards, lists, actions, forms, and data displays.
* Ensure the migrated version contains everything present in the original design.

Do not redesign these pages.

Port missing functionality and UI exactly from the source.

---

## Fix 2: Audit All Routes For Missing Content

Perform a complete route audit.

Check every page against the original prototype:

* `/onboarding`
* `/roles`
* `/doctor/setup`
* `/`
* `/reception`
* `/schedule`
* `/patients`
* `/patients/[id]`
* `/consultation`
* `/appointments/[id]`
* `/checkout/[id]`
* `/finance`
* `/finance/lab`

For every route:

1. Verify page renders.
2. Verify page is not blank.
3. Verify all source sections are present.
4. Verify all cards render.
5. Verify all lists render.
6. Verify all actions render.
7. Verify all sheets still work.

If anything is missing from the original prototype, restore it.

---

## Fix 3: Bottom Navigation Visibility

BottomNav is incorrectly appearing on onboarding-related screens.

BottomNav must NOT render on:

* `/onboarding`
* `/roles`
* `/doctor/setup`

Verify the visibility rules and fix them.

Only change the BottomNav visibility logic.

Do not modify the BottomNav UI itself.

---

## Validation Pass

After implementing the fixes:

* Compare every route against the original source.
* Confirm no page is blank.
* Confirm no sections are missing.
* Confirm BottomNav visibility rules work correctly.
* Confirm no visual regressions were introduced.

Do not perform any refactoring during this pass.

Focus only on restoring missing content and fixing BottomNav visibility.
