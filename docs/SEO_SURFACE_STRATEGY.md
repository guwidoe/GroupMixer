# GroupMixer SEO surface strategy

## Intentional indexed surface

The public SEO surface is:

- `/`
- locale-aware landing routes like `/es/...` and `/fr/...` when a page is live in those locales
- shared tool landing pages from `webapp/src/pages/toolPageConfigs.data.mjs`

The advanced workspace is **not** an SEO target:

- `/app`
- `/app/*`

Those routes should remain user-accessible but search-visible as `noindex,nofollow`.

## Why

Search Console showed `/app` utility routes being indexed. Those routes are useful product surfaces, but weak search-intent landing pages. We therefore concentrate crawl/index signals on the shared landing pages.

## Source of truth

Landing-page SEO inventory lives in:

- `webapp/src/pages/toolPageConfigs.data.mjs`
- validated + typed via `webapp/src/pages/toolPageConfigs.ts`

That manifest drives:

- app route registration
- locale-aware route registration
- landing-page copy + metadata
- audience framing + shared CTA content
- experiment labels + rollout inventory metadata
- sitemap generation
- static landing prerender output

Localized copy resources live in:

- `webapp/src/i18n/landing/en.ts`
- `webapp/src/i18n/landing/de.ts`
- `webapp/src/i18n/landing/es.ts`
- `webapp/src/i18n/landing/fr.ts`
- `webapp/src/i18n/landing/ja.ts`
- `webapp/src/i18n/landing/hi.ts`
- `webapp/src/i18n/landing/zh.ts`

## Current English landing inventory

Current live rollout set on the shared landing engine:

| Priority | Route | Search intent | Primary audience |
| --- | --- | --- | --- |
| primary | `/` | random group generator | broad classrooms / workshops / events |
| primary | `/random-group-generator` | random group generator | facilitators and teachers |
| primary | `/random-team-generator` | random team generator | coaches and team leads |
| primary | `/random-pair-generator` | random pair generator | partner activities / classrooms |
| primary | `/breakout-room-generator` | breakout room generator | remote workshops / trainings |
| primary | `/workshop-group-generator` | workshop group generator | facilitators and training teams |
| primary | `/student-group-generator` | student group generator | teachers and school staff |
| primary | `/speed-networking-generator` | speed networking generator | event organizers |
| supporting | `/team-shuffle-generator` | team shuffle generator | coaches / managers / facilitators |
| supporting | `/icebreaker-group-generator` | icebreaker group generator | teachers / hosts / facilitators |
| supporting | `/group-generator-with-constraints` | group generator with constraints | planners with assignment rules |

Next candidates to evaluate before publishing more English pages:

- classroom-focused synonym pages only if they add distinct search demand beyond `student-group-generator`
- conference / summit networking pages only if event-specific copy outperforms generic networking pages
- training / cohort-specific pages only if they can reuse the shared engine without functional divergence

## Current multilingual rollout

German, Spanish, French, Japanese, Hindi, and Simplified Chinese are now live on the shared landing engine for the highest-value landing pages:

- `/` ↔ `/de` ↔ `/es` ↔ `/fr` ↔ `/ja` ↔ `/hi` ↔ `/zh`
- `/random-group-generator` ↔ `/de/random-group-generator` ↔ `/es/random-group-generator` ↔ `/fr/random-group-generator` ↔ `/ja/random-group-generator` ↔ `/hi/random-group-generator` ↔ `/zh/random-group-generator`
- `/random-team-generator` ↔ `/de/random-team-generator` ↔ `/es/random-team-generator` ↔ `/fr/random-team-generator` ↔ `/ja/random-team-generator` ↔ `/hi/random-team-generator` ↔ `/zh/random-team-generator`
- `/breakout-room-generator` ↔ `/de/breakout-room-generator` ↔ `/es/breakout-room-generator` ↔ `/fr/breakout-room-generator` ↔ `/ja/breakout-room-generator` ↔ `/hi/breakout-room-generator` ↔ `/zh/breakout-room-generator`
- `/workshop-group-generator` ↔ `/de/workshop-group-generator` ↔ `/es/workshop-group-generator` ↔ `/fr/workshop-group-generator` ↔ `/ja/workshop-group-generator` ↔ `/hi/workshop-group-generator` ↔ `/zh/workshop-group-generator`
- `/student-group-generator` ↔ `/de/student-group-generator` ↔ `/es/student-group-generator` ↔ `/fr/student-group-generator` ↔ `/ja/student-group-generator` ↔ `/hi/student-group-generator` ↔ `/zh/student-group-generator`
- `/speed-networking-generator` ↔ `/de/speed-networking-generator` ↔ `/es/speed-networking-generator` ↔ `/fr/speed-networking-generator` ↔ `/ja/speed-networking-generator` ↔ `/hi/speed-networking-generator` ↔ `/zh/speed-networking-generator`

Supporting English-only pages remain unprefixed for now until they justify localization demand and review effort.

Future locale expansion policy beyond the currently shipped locales is documented in:

- `docs/MULTILINGUAL_LANDING_ROLLOUT.md`

## Build-time SEO artifacts

Two scripts are now part of the workflow:

- `npm run sync:seo-assets`
  - regenerates `webapp/public/sitemap.xml` from the landing-page manifest
- `npm run prerender:seo`
  - after `vite build`, writes prerendered HTML for landing routes into `webapp/dist/`
  - also writes a dedicated noindex app shell at `dist/app/index.html`

The normal webapp build runs both automatically.

## Multilingual route + SEO contract

Current route policy:

- English is the default unprefixed locale
  - `/`
  - `/random-team-generator`
- localized landing pages use locale prefixes
  - `/es/...`
  - `/de/...`
  - `/fr/...`
  - `/ja/...`
  - `/hi/...`
  - `/zh/...` (Simplified Chinese, hreflang `zh-Hans`)
- the advanced workspace remains shared and not localized for SEO
  - `/app`
  - `/app/*`

Canonical / hreflang policy:

- each localized landing page self-canonicalizes
- alternates are emitted for every live locale variant of the same landing page
- `x-default` always points to the English route
- `/app` keeps `noindex,nofollow` and does not participate in multilingual SEO

Sitemap policy:

- every live localized landing route appears in the sitemap
- each sitemap entry includes `xhtml:link` alternates for sibling locales + `x-default`
- a locale/page only appears when its localized resource file is present and the page definition marks that locale as live

## Vercel routing policy

`webapp/vercel.json` now uses filesystem-first routing:

1. serve prerendered landing pages if they exist
2. rewrite `/app` and `/app/*` to the dedicated noindex app shell
3. fall back to `/index.html` for SPA routing

## Adding a new landing page safely

1. Add the page config to `webapp/src/pages/toolPageConfigs.data.mjs`
2. Keep it inside the shared content model:
   - locale-invariant page definition in `webapp/src/pages/toolPageConfigs.data.mjs`
   - localized content resource in `webapp/src/i18n/landing/<locale>.ts`
   - `seo.title`
   - `seo.description`
   - `hero.eyebrow`
   - `hero.title`
   - `hero.subhead`
   - `hero.audienceSummary`
   - `faqEntries`
   - `useCasesSection`
   - `advancedSection`
   - `experiment.label` / `experiment.futureVariants`
   - `inventory.searchIntent` / `inventory.audience` / `inventory.priority`
3. Do **not** copy `ToolLandingPage.tsx` or create page-specific landing components.
4. Re-run:
   - `cd webapp && npm run sync:seo-assets`
5. Verify route metadata/tests as needed
6. Build once to confirm prerender output:
   - `cd webapp && npm run build`

If a new landing page is not in the manifest, it will not automatically appear in the sitemap or prerender output.

## Guardrail

Do **not** create page-specific functional forks for SEO pages.

Landing pages should share the same functional implementation and differ mainly in:

- copy
- metadata
- FAQ/schema content
- target audience framing
- experiment labels

## Shared behavior vs config-only differences

The landing-page factory is intentionally split into:

- shared behavior
  - quick setup form
  - solver integration
  - results rendering
  - workspace handoff
  - telemetry plumbing
- config-only differences
  - copy
  - metadata
  - FAQ/schema text
  - audience framing
  - experiment labels
  - rollout priority

If a new search-intent page needs different functionality, treat that as product work first — not as an SEO-page fork.

## Regression strategy for the landing-page factory

When adding or editing landing pages:

- keep deep behavioral coverage in the shared landing tests (`webapp/src/pages/ToolLandingPage.test.tsx`)
- keep per-page checks lightweight in the route-inventory test (`webapp/src/pages/ToolLandingPage.routes.test.tsx`)
- only add bespoke browser/E2E work if a page introduces real functional differences

Expected workflow for a new page:

1. add or update config data
2. run the lightweight route-inventory test to verify title, canonical, key copy, and schema wiring
3. rely on the shared landing behavior tests for generator/workspace/telemetry behavior

This keeps page expansion reviewable and avoids turning every SEO route into its own app surface.
