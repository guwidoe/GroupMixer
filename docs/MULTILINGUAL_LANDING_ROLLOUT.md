# GroupMixer multilingual landing rollout policy

## Purpose

This document defines the go / no-go checkpoint for expanding beyond the current multilingual landing rollout.

Current shipped landing locales:

- English (`/slug`)
- Spanish (`/es/slug`) for selected high-value pages
- French (`/fr/slug`) for selected high-value pages

Not yet approved for implementation:

- Japanese
- Hindi
- Chinese

The rule is simple: **new locales ship only when demand, review quality, and operating constraints are all acceptable**.

## Evidence required before a new locale ships

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

## Evaluation criteria by locale

### Japanese

Potentially viable if:

- Search Console shows meaningful demand from Japanese queries or Japan-based traffic
- the high-intent landing pages map cleanly to existing use cases
- concise, natural Japanese copy can be reviewed by a competent speaker

Specific concerns:

- Japanese copy quality degrades quickly with literal translation
- short headings / CTA text need human review for tone and clarity
- we should not localize Japanese slugs first; keep the shared English slug structure until demand is proven

### Hindi

Potentially viable if:

- there is measurable demand from Hindi-language search behavior rather than English usage in India
- the target audience actually benefits from Hindi landing copy for the current product intent
- we have a reviewer who can judge whether the copy sounds natural and useful

Specific concerns:

- English overlap may be high, so demand must justify the extra maintenance burden
- machine-translated Hindi often sounds overly formal or unnatural for product landing pages
- support / review capacity matters more than raw traffic alone

### Chinese

Chinese requires a **separate approval step** beyond normal locale demand.

Potentially viable only if all of the following are addressed:

- we decide whether the target is Simplified Chinese, Traditional Chinese, or both
- we decide which search/distribution surface matters (Google-facing only vs broader China-facing distribution)
- we review hosting / CDN / crawl constraints if mainland-China SEO is in scope
- we confirm terminology review capacity for the chosen script variant

Specific concerns:

- “Chinese” is not one locale decision; script and market strategy matter
- if mainland-China SEO is desired, distribution and infrastructure constraints are materially different
- if we cannot commit to a distribution strategy, Chinese should remain in exploration

## Go / no-go checklist

A locale moves from exploration to implementation only when the answer to every item below is **yes**:

- Is there sustained search demand for this locale?
- Can at least 2–3 existing landing intents be translated without product forks?
- Do we have a human reviewer for the locale?
- Can we maintain and QA the locale after launch?
- Do we understand any market-specific distribution constraints?
- For Chinese specifically: has script + market scope been explicitly approved?

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
