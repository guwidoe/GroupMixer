# Visual Regression Testing

Visual regression in GroupMixer is a **separate layout/styling safety net**.

Use it to catch:
- broken layouts
- modal rendering regressions
- responsive/mobile drift
- dark-mode/theme regressions
- UI chrome changes that functional tests may not notice

Do **not** treat it as a substitute for:
- unit/store/service coverage
- component interaction tests
- Playwright workflow tests

Those layers own behavior correctness. Visual regression only owns appearance-sensitive regressions.

## What the curated suite covers

The current curated Playwright visual suite focuses on high-value, layout-sensitive states:
- landing page shell
- key scenario-editor states and modal entry points
- populated constraints layouts
- solver ready/custom-settings states
- empty result/history/editor states
- header/dropdown/scenario-manager chrome
- one representative mobile populated state
- representative dark-mode populated states

The suite is intentionally narrower than the full functional workflow suite to avoid noisy, low-value snapshots.

## Canonical commands

```bash
# Curated visual suite across configured projects
cd webapp
npm run test:e2e:visual

# Stable desktop-only pass for quick review
cd webapp
npm run test:e2e:visual:stable

# Debug interactively
cd webapp
npm run test:e2e:ui -- visual-regression.spec.ts

# Update baselines after intentional UI changes
cd webapp
npm run test:e2e:visual:update
```

## Snapshot policy

Baseline images live under `webapp/e2e/snapshots/` and are committed to the repo.

When updating baselines:
1. confirm the UI change is intentional
2. update only the affected snapshots
3. review the generated diffs before committing
4. mention the intentional visual change in the related commit/PR notes

## CI / enforcement posture

Visual regression is **not** the primary PR gate.

Current posture:
- required PR gates: lint, unit/component coverage, Rust tests/coverage, Playwright workflow tests
- visual regression: run deliberately when touching layout/theme/responsive/modal-heavy UI, and keep baselines healthy as part of UI-focused work

This keeps the suite valuable without letting screenshot churn replace behavior testing.

## Tips for stable screenshots

- wait for network idle and settle animations before capturing
- prefer demo-data-backed states over brittle manual setup where possible
- avoid capturing transient notifications/spinners/timestamps when they do not add safety value
- crop to a focused area when a smaller visual target provides the signal you need
