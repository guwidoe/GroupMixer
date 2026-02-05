# Visual Regression Testing

This project uses Playwright's built-in screenshot comparison for visual regression testing.

## Overview

Visual regression tests capture screenshots of the application in various states and compare them against baseline images. When the UI changes, the tests will fail and show the differences, allowing you to catch unintended visual changes.

## Running Visual Regression Tests

```bash
# Run all visual regression tests
pnpm test:e2e:visual

# Run with UI mode for debugging
pnpm test:e2e:ui -- visual-regression.spec.ts

# Run headed (visible browser)
pnpm test:e2e:headed -- visual-regression.spec.ts

# Run specific project (desktop, mobile, dark mode)
pnpm playwright test visual-regression.spec.ts --project=chromium
pnpm playwright test visual-regression.spec.ts --project=mobile-chrome
pnpm playwright test visual-regression.spec.ts --project=chromium-dark
```

## Updating Baselines

When you make intentional UI changes, you need to update the baseline screenshots:

```bash
# Update all visual regression baselines
pnpm test:e2e:visual:update

# Update baselines for specific project
pnpm playwright test visual-regression.spec.ts --project=chromium --update-snapshots

# Update a specific test's baseline
pnpm playwright test visual-regression.spec.ts -g "people section" --update-snapshots
```

## Test Structure

Visual regression tests are organized by page/feature:

- **Landing Page**: Hero section, full page scroll
- **Problem Editor**: People, Groups, Sessions, Objectives, Constraints sections
- **Solver Panel**: Empty state, ready state, settings
- **Results**: Empty state, results display
- **Manual Editor**: Empty state
- **Header/Navigation**: Controls, dropdowns, modals

Each section tests:
- **Empty state**: No data loaded
- **Populated state**: With demo data loaded
- **Modal states**: Open dialogs and modals
- **Responsive**: Mobile viewport (in mobile-chrome project)
- **Dark mode**: Dark theme (in chromium-dark project)

## Snapshot Directory Structure

Snapshots are stored in `e2e/snapshots/` with the following structure:

```
e2e/snapshots/
└── tests/
    └── visual-regression.spec.ts-snapshots/
        ├── landing-hero-chromium.png
        ├── landing-hero-mobile-chrome.png
        ├── people-empty-chromium.png
        ├── people-empty-chromium-dark.png
        └── ...
```

## Configuration

Visual regression settings are in `playwright.config.ts`:

- **maxDiffPixelRatio**: 0.005 (0.5% pixel difference allowed)
- **animations**: disabled (for consistent screenshots)
- **viewport**: 1280x720 for desktop, Pixel 5 for mobile

## CI Integration

Visual regression tests run on every PR in the GitHub Actions workflow:

1. Tests compare against committed baseline snapshots
2. On failure, artifacts are uploaded:
   - `visual-regression-report`: Full Playwright HTML report
   - `screenshot-diffs`: Only the diff images showing what changed

## Best Practices

1. **Review diffs carefully**: Before updating baselines, verify the change is intentional
2. **Commit baselines**: Baseline images should be committed to the repository
3. **Run locally first**: Test visual changes locally before pushing
4. **Use descriptive names**: Test names become part of the snapshot filename

## Troubleshooting

### Tests fail on CI but pass locally

This usually happens due to:
- Font rendering differences (use web fonts)
- Different screen DPI (we use `scale: 'device'`)
- Animation timing (we disable animations)

### Large diffs for small changes

Check if:
- Animations are disabled
- Page has fully loaded (use `waitForPageReady`)
- No flaky content (loading spinners, timestamps)

### Updating baselines on CI

If you need to update baselines:
1. Run `pnpm test:e2e:visual:update` locally
2. Commit the new snapshot images
3. Push to update the PR
