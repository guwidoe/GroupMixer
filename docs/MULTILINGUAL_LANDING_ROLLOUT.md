# GroupMixer multilingual landing rollout policy

## Purpose

This document defines the operating policy for multilingual landing expansion **after** the currently approved locale set.

Current shipped landing locales:

- English (`/slug`)
- German (`/de/slug`) for selected high-value pages
- Spanish (`/es/slug`) for selected high-value pages
- French (`/fr/slug`) for selected high-value pages
- Japanese (`/ja/slug`) for selected high-value pages
- Hindi (`/hi/slug`) for selected high-value pages
- Simplified Chinese (`/zh/slug`, hreflang `zh-Hans`) for selected high-value pages

## What is already approved

The following decisions are now implemented:

- German is approved and live on the shared landing engine
- Japanese is approved and live on the shared landing engine
- Hindi is approved and live on the shared landing engine
- Chinese is approved specifically as **Simplified Chinese**
- Chinese uses the shared `/zh/...` route prefix with hreflang `zh-Hans`
- all of these locales reuse the same shared landing components and app/workspace architecture

## What still requires a checkpoint

Any further locale expansion beyond the current shipped set should still be evidence-driven.

The rule is simple: **new locales ship only when demand, review quality, and operating constraints are all acceptable**.

## Evidence required before another locale ships

A candidate locale should not move into implementation unless all of the following are true:

1. **Search demand is visible**
   - Search Console shows sustained impressions or clicks from the target language / countries
   - there are multiple high-intent queries that map to existing landing intents
   - demand is not just broad vanity traffic; it should align with real use cases like classroom groups, workshops, breakout rooms, or networking

2. **Landing-page fit is clear**
   - at least 2–3 existing landing pages are strong candidates for translation
   - the locale can reuse the current shared landing engine without product forks
   - we are not forced into localizing `/app` just to make the SEO surface usable

3. **Content quality can be reviewed by a human**
   - a reviewer can validate copy, terminology, and CTA tone
   - FAQ answers and schema text can be checked for correctness
   - we are not relying on machine-generated copy alone for production pages

4. **The locale can be operated**
   - someone can update copy when product messaging changes
   - basic QA can be performed after major landing changes
   - there is a plan for monitoring locale-specific traffic and conversions

## Additional operating notes for current non-English locales

### Japanese

- keep slugs shared with English unless there is a strong reason to localize them later
- short headings and CTA text should be reviewed carefully for tone and clarity
- avoid literal translations when shorter, more natural phrasing is better

### Hindi

- watch for overly formal phrasing in future revisions
- validate that usage demand justifies ongoing maintenance versus English usage overlap
- prioritize clarity over word-for-word translation

### Simplified Chinese

- current Chinese support is **Simplified Chinese only**
- if Traditional Chinese is ever considered, treat it as a separate locale decision
- if mainland-China distribution becomes a goal, re-evaluate hosting / crawl / infrastructure assumptions explicitly
- continue using the shared English slug structure unless there is strong evidence for changing it

## Go / no-go checklist for any future locale

A locale moves from exploration to implementation only when the answer to every item below is **yes**:

- Is there sustained search demand for this locale?
- Can at least 2–3 existing landing intents be translated without product forks?
- Do we have a human reviewer for the locale?
- Can we maintain and QA the locale after launch?
- Do we understand any market-specific distribution constraints?
- If script or market scope is ambiguous, has that ambiguity been resolved explicitly?

If any answer is **no**, the locale stays in exploration.

## Implementation policy once approved

When a future locale is approved:

- add locale resources, not duplicated page components
- keep English slugs initially
- localize landing pages only before considering `/app`
- require lightweight metadata/route coverage plus shared landing behavior tests
- add the locale to the manifest-driven sitemap / hreflang system only after content is review-complete

## Non-goal

This policy does **not** approve full product localization of `/app`.

That remains a separate decision and should only be revisited if localized landing pages show meaningful usage that cannot be served by the current shared expert workspace.
