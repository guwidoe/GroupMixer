# GroupMixer SEO surface strategy

Execution backlog:

- `docs/SEO_BACKLOG.md`
- `docs/SEO_GUIDES_IA_PLAN.md`

## Intentional indexed surface

The public SEO surface is:

- `/`
- localized home routes: `/de`, `/es`, `/fr`, `/ja`, `/hi`, `/zh`
- guide pages under `/guides/...`

The advanced workspace is not an SEO target:

- `/app`
- `/app/*`

Those routes should remain user-accessible but search-visible as `noindex,nofollow`.

## Why

GroupMixer now uses one actual landing tool and guide pages for specific search intent. We do not maintain multiple near-identical tool landing pages.

The homepage carries direct tool intent. Guides capture workflow, audience, and capability intent with clearer editorial structure.

## Source of truth

The home landing page config lives in:

- `webapp/src/pages/toolPageConfigs.data.mjs`
- validated + typed via `webapp/src/pages/toolPageConfigs.ts`

Guide inventory lives in:

- `webapp/src/pages/guidePageConfigs.ts`
- typed via `webapp/src/pages/guidePageTypes.ts`

Localized landing-page copy resources live in:

- `webapp/src/i18n/landing/en.ts`
- `webapp/src/i18n/landing/de.ts`
- `webapp/src/i18n/landing/es.ts`
- `webapp/src/i18n/landing/fr.ts`
- `webapp/src/i18n/landing/ja.ts`
- `webapp/src/i18n/landing/hi.ts`
- `webapp/src/i18n/landing/zh.ts`

Localized shared landing-tool and inline-results UI strings live in:

- `webapp/src/i18n/landingUi.ts`

## Current landing inventory

Current live rollout set:

| Route set | Search intent | Primary audience |
| --- | --- | --- |
| `/`, `/de`, `/es`, `/fr`, `/ja`, `/hi`, `/zh` | random group generator | classrooms, workshops, and events |

Additional intent should be covered by guides, not by adding more tool landing variants.

## Build-time SEO artifacts

Two scripts are part of the workflow:

- `npm run sync:seo-assets`
  - regenerates `webapp/public/sitemap.xml` from the landing and guide manifests
- `npm run prerender:seo`
  - after `vite build`, writes prerendered HTML for SEO routes into `webapp/dist/`
  - also writes a dedicated noindex app shell at `dist/app/index.html`

The normal webapp build runs both automatically.

## Multilingual route + SEO contract

Current route policy:

- English is the default unprefixed locale: `/`
- localized home pages use locale prefixes
  - `/de`
  - `/es`
  - `/fr`
  - `/ja`
  - `/hi`
  - `/zh` (Simplified Chinese, hreflang `zh-Hans`)
- guides currently live under English `/guides/...` paths
- the advanced workspace remains shared and not localized for SEO

Canonical / hreflang policy:

- each localized home page self-canonicalizes
- alternates are emitted for every live locale variant of the same page
- `x-default` points to `/`
- `/app` keeps `noindex,nofollow` and does not participate in multilingual SEO

## Vercel routing policy

`webapp/vercel.json` uses filesystem-first routing:

1. serve prerendered SEO pages if they exist
2. rewrite `/app` and `/app/*` to the dedicated noindex app shell
3. fall back to `/index.html` for SPA routing

## Adding SEO surface safely

Add guides for specific workflow or capability intent. Do not add a second copy of the landing tool unless there is a deliberate product decision to reintroduce tool variants.

Expected guide workflow:

1. Add the guide config to `webapp/src/pages/guidePageConfigs.ts`
2. Keep guide CTAs and related links inside the guide system until a new linking plan is approved
3. Re-run:
   - `cd webapp && npm run sync:seo-assets`
4. Verify guide metadata/tests as needed
5. Build once to confirm prerender output:
   - `cd webapp && npm run build`

## Guardrail

Do not create page-specific functional forks for SEO pages.

The landing page should remain one tool implementation. Additional search-intent coverage should come from guides unless the product surface itself changes.
