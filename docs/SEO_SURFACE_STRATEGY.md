# GroupMixer SEO surface strategy

## Intentional indexed surface

The public SEO surface is:

- `/`
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

That manifest drives:

- app route registration
- landing-page copy + metadata
- sitemap generation
- static landing prerender output

## Build-time SEO artifacts

Two scripts are now part of the workflow:

- `npm run sync:seo-assets`
  - regenerates `webapp/public/sitemap.xml` from the landing-page manifest
- `npm run prerender:seo`
  - after `vite build`, writes prerendered HTML for landing routes into `webapp/dist/`
  - also writes a dedicated noindex app shell at `dist/app/index.html`

The normal webapp build runs both automatically.

## Vercel routing policy

`webapp/vercel.json` now uses filesystem-first routing:

1. serve prerendered landing pages if they exist
2. rewrite `/app` and `/app/*` to the dedicated noindex app shell
3. fall back to `/index.html` for SPA routing

## Adding a new landing page safely

1. Add the page config to `webapp/src/pages/toolPageConfigs.data.mjs`
2. Re-run:
   - `cd webapp && npm run sync:seo-assets`
3. Verify route metadata/tests as needed
4. Build once to confirm prerender output:
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
