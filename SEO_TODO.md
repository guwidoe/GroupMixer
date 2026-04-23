# SEO TODO (based on current code review)

_Date: 2026-04-23_

This list is based on the current `webapp/` code, not the earlier generic SEO advice.

## What is already implemented enough that I would stop circling on it for now

- [x] **Thin app routes are already marked non-indexable in code**
  - `webapp/src/MainApp.tsx`
  - `webapp/src/seo/seoDocument.ts`
  - Current behavior: app routes render `indexable={false}` and therefore get `noindex,nofollow`.
  - Note: I would verify this in Search Console after deploy, but I would **not** spend more coding time here first.

- [x] **hreflang + sitemap plumbing already exists**
  - `webapp/src/pages/toolPageConfigs.ts`
  - `webapp/scripts/seoArtifacts.tsx`
  - Alternate links and sitemap generation are already wired.

- [x] **Offline support already exists in product code**
  - `webapp/src/offline/registerOfflineSupport.ts`
  - `webapp/src/main.tsx`
  - This means English copy can safely say **works offline after first load**.

---

## Priority order

## P0 — Fix the homepage H1 so crawlers see one clean message

- [ ] **Replace the animated homepage H1 with a crawl-clean static H1**
  - Files:
    - `webapp/src/components/LandingPage/HomeAnimatedHeroTitle.tsx`
    - `webapp/src/pages/ToolLandingPage.tsx`
    - `webapp/src/i18n/landing/en.ts`
  - Why this is first:
    - The current homepage H1 is visually animated via `HomeAnimatedHeroTitle`, which injects rotating words like `Random`, `Optimized`, `Multi-round`, and `Constraint-based` into the H1.
    - That is very likely why Google is getting a muddled signal from the homepage.
  - Recommendation:
    - Keep the homepage H1 as **one static phrase**.
    - If you want animation, move it into a decorative element **outside** the H1.
  - Done when:
    - View-source / prerendered HTML contains a single clean homepage H1.
    - No repeated or rotating keyword variants appear inside the H1 markup.
  - Notes: I must be possible to have the animation displayed but have a clean h1 for crawling. I refuse to believe thats not possible. The crawled h1 should be this: "Group Generator - Random, Balanced & Multi-Round"

- [ ] **Align homepage title + H1 + subhead around one promise**
  - Files:
    - `webapp/src/i18n/landing/en.ts`
  - Why this matters:
    - Current homepage SEO title is `Group Generator - Random, Balanced & Multi-Round`.
    - Current homepage H1 is `Random Group Generator`.
    - Those are better than before, but still not one unified message stack.
  - Recommendation:
    - Pick one primary phrase for the homepage and make title/H1/subhead reinforce it.
    - Example direction: `Random Group Generator for Balanced, Multi-Round Assignments`.
  - Done when:
    - Title, H1, and first paragraph feel like one coherent answer to one search intent.
  - Notes: - Current homepage SEO title is `Group Generator - Random, Balanced & Multi-Round`.
    - Current homepage H1 is `Random Group Generator`.

    I think these sound good? Seem well aligned already to me... I dont understand the issue. Please re explain.

---

## P0 — Actually render the hero copy you already wrote

- [ ] **Render `hero.eyebrow`, `hero.subhead`, `hero.audienceSummary`, and `hero.trustBullets` on the page**
  - Files:
    - `webapp/src/pages/ToolLandingPage.tsx`
    - `webapp/src/pages/toolPageTypes.ts`
    - `webapp/src/i18n/landing/en.ts`
  - Why this is urgent:
    - The content model already has these fields.
    - But `ToolLandingPage.tsx` currently renders the H1 and tool UI, and does **not** render the actual hero subhead / trust copy.
    - So the most important crawlable copy is effectively missing from the visible landing-page body.
  - Recommendation:
    - Add a visible hero text block directly under the H1 and above or beside the tool.
    - This is where the trust facts should live.
  - Done when:
    - Every English landing page shows a visible subhead and trust bullets without opening the FAQ.
  - Notes: Absolutely not. This stuff is deliberately now below the tool, because my landing page should be tool-first, like many of the highest ranking competitors. That is the absolute priority. 
I see this as superseeded by the tooltips on the tool first page, I hoped they should be crawlable too, just like a lot of my tool surface and explanations on the landing page. 
The bullets etc are then suprseded by this ![alt text](image.png)
The "trust bullets" sound way too commercial and i thought might actually deter people. What do you think when you hear "FREE"? You think premium with dumbed down free version. I dont even want to get people thinking about these things. Of the top current results, many dont mention this.

- [ ] **Put the trust facts directly below the hero/tool, not only in FAQ/footer**
  - Files:
    - `webapp/src/pages/ToolLandingPage.tsx`
    - `webapp/src/i18n/landing/en.ts`
  - Trust facts to expose prominently on English pages:
    - Free
    - No account / no sign-up
    - No usage limits
    - Processed in your browser / stays on this device
    - Works offline after first load
  - Why:
    - Right now these facts are mostly buried in FAQ entries and the footer privacy note.
    - French/Japanese already communicate this more clearly than English.
  - Done when:
    - A first-time visitor can answer price/privacy/account/offline questions from above-the-fold copy.
  - Notes: Absolutely in the FAQ

---

## P1 — Fix the English trust/FAQ set so it matches what the product already does

- [ ] **Expand the English FAQ set with the missing core trust questions**
  - Files:
    - `webapp/src/i18n/landing/en.ts`
  - Add explicit English entries for:
    - Is GroupMixer free?
    - Are there any usage limits?
    - Do I need an account?
    - Where is my data processed?
    - Does it work offline?
    - Can I avoid repeat pairings across rounds?
    - Can I keep certain people together or apart?
    - Can I balance by role, skill, gender, or department from CSV?
    - Can I fix certain people to groups?
    - When should I use the scenario editor instead of the simple tool?
  - Why:
    - English currently has some of this, but not the full set, and offline is missing.
  - Done when:
    - English FAQ coverage matches the actual product and no longer lags behind FR/JA.
  - Notes:

- [ ] **Use FR/JA as source material for English trust copy**
  - Files:
    - `webapp/src/i18n/landing/fr.ts`
    - `webapp/src/i18n/landing/ja.ts`
    - `webapp/src/i18n/landing/en.ts`
  - Why:
    - FR/JA already state the strongest user-facing truths more clearly:
      - completely free
      - no account
      - no usage limits
      - local browser processing
      - offline after load
  - Done when:
    - English no longer sounds weaker or more ambiguous than other locales.
  - Notes: Yes i agree, the FAQ must be strongly improved.

---

## P1 — Differentiate the English landing pages that are still too similar

- [ ] **Break the shared middle-section copy on the primary English pages**
  - Files:
    - `webapp/src/i18n/landing/en.ts`
  - Evidence in current code:
    - `USE_CASES_SECTION` is shared.
    - `ADVANCED_SECTION` is shared.
    - Many pages use those same defaults via `createContent(...)`.
  - Why this matters:
    - The pages have different intents, but much of the body copy is reused almost verbatim.
    - That makes it harder for Google to understand which page is best for which query.
  - Priority pages to differentiate first:
    - `/`
    - `/random-group-generator`
    - `/random-team-generator`
    - `/student-group-generator`
    - `/speed-networking-generator`
  - Done when:
    - Each of those pages has its own intro angle, use cases, advanced section wording, and FAQ emphasis.
  - Notes: Stuff should be reused if its relevant for all of them. I don't want to create work for nothing.

- [ ] **Give each primary page one unique worked example, not just generic cards**
  - Likely files:
    - `webapp/src/pages/toolPageTypes.ts`
    - `webapp/src/pages/ToolLandingPage.tsx`
    - `webapp/src/i18n/landing/en.ts`
  - Recommended examples:
    - Home: 24 names → 6 balanced groups
    - Random group generator: quick classroom split
    - Random team generator: balanced teams by role/skill CSV
    - Student group generator: teacher roster with support for balancing
    - Speed networking generator: 4 rounds with reduced repeat pairings
  - Why:
    - Right now the pages explain capabilities, but they do not strongly show intent-specific examples/output.
  - Done when:
    - Each priority page has one page-specific example block that would not make sense on the others.
  - Notes: Not sure how to best do that. I think an empty tool with just ghost examples has its merit. When i showed it to someone they were confused when the stuff came pre-filled. Thats why we have the Example-Data button.
  I will absolutely not custom design the landing oage tool surface for each of the pages because its already extremely good universally and was a shit ton of work. its really well refined ui/ux wise imo. Hard to improve. Much, much better than all competitors.

- [ ] **Make related internal links more intent-specific**
  - Files:
    - `webapp/src/pages/ToolLandingPage.tsx`
  - Why:
    - The `More group generator tools` block is useful, but it is still fairly generic.
  - Recommendation:
    - Tune the intro sentence and link ordering per page so the internal links reinforce intent separation.
  - Done when:
    - The related-links section feels like a curated next step for that page, not a generic tool directory.
  - Notes: I think that block is a bit weird because the "tool" is identical on all those pages and will stay that way. Maybe we should change that into a blog type thing where we explain how to use the tool for each of the usecases... instead of having multiple landing pages..

---

## P2 — Tighten titles and meta descriptions after the body copy is fixed

- [ ] **Rewrite English meta descriptions so they include trust facts, not just features**
  - Files:
    - `webapp/src/i18n/landing/en.ts`
  - Why:
    - Many current English descriptions explain features but do not surface the highest-conversion trust facts.
  - Recommendation:
    - For the top pages, work at least two of these into the description where natural:
      - free
      - no sign-up
      - runs in your browser
      - works offline after first load
  - Done when:
    - The main English pages have meta descriptions that clearly answer both “what does it do?” and “can I trust/use it quickly?”
  - Notes: I disagree ith this, already argued earlier why.

- [ ] **Build a one-page copy matrix before further tweaking titles**
  - Suggested output: a tiny markdown table for each English target page with:
    - target query
    - title
    - H1
    - subhead
    - trust bullets
    - unique example
  - Why:
    - This will stop the current loop of changing copy in isolation.
  - Done when:
    - Every primary page has one clear role and does not overlap heavily with its neighbor.
  - Notes:

---

## P2 — Add light structured data improvements, but only after copy/intent issues are fixed

- [ ] **Keep current route-level schema, then add site-level brand schema**
  - Files:
    - `webapp/src/seo/seoDocument.ts`
  - Current state:
    - Route schema already emits `WebApplication` + `FAQPage`.
    - There is no `WebSite` or `Organization` node yet.
  - Recommendation:
    - Add `WebSite` and `Organization` on the homepage/site shell for brand clarity.
    - Do not overinvest here until copy and page differentiation are fixed.
  - Done when:
    - Homepage has clean brand/site schema in addition to the existing route schema.
  - Notes:Idk about this and have no opinion on it

---

## P3 — Verify the technical SEO after deploy instead of continuing to refactor blindly

- [ ] **Deploy, then inspect the homepage and 3 key landing pages in Search Console**
  - Check:
    - chosen canonical
    - indexed vs not indexed
    - detected page title
    - detected snippet text
    - hreflang cluster behavior
  - Why:
    - At this point the next useful information comes from Google’s actual interpretation, not more guesswork.
  - Done when:
    - You have one screenshot / note per page of what Google is actually seeing.
  - Notes: The extra landing pages get 0 clicks and impressions. ![alt text](image-1.png)
  This is the current data
  Top pages
Clicks
Impressions
https://www.groupmixer.app/
111	764
https://www.groupmixer.app/ja
5	127
https://www.groupmixer.app/de
5	90
https://www.groupmixer.app/es
2	104
https://www.groupmixer.app/app
1	21
https://www.groupmixer.app/zh
0	17
https://www.groupmixer.app/app/problem/objectives
0	13
https://www.groupmixer.app/fr
0	3
https://www.groupmixer.app/app/history
0	2
https://www.groupmixer.app/app/problem/sessions
0	1


- [ ] **Optional tiny cleanup: consider `noindex,follow` instead of `noindex,nofollow` for app routes**
  - Files:
    - `webapp/src/seo/seoDocument.ts`
  - Important:
    - This is a minor cleanup, not a first-order ranking issue.
    - Only do this after the content/H1 work above.
  - Done when:
    - Decision made: keep as-is or switch intentionally.
  - Notes:

---

## Suggested working order

- [ ] 1. Clean homepage H1
- [ ] 2. Render hero subhead + trust bullets
- [ ] 3. Upgrade English trust copy and FAQ set
- [ ] 4. Differentiate the top 4–5 English pages
- [ ] 5. Add page-specific examples
- [ ] 6. Tighten meta descriptions
- [ ] 7. Add site-level schema if still worth doing
- [ ] 8. Validate with Search Console after deploy

---

## If you want to keep scope tight this week

If I were cutting this down to the highest-leverage shortlist, I would do only these first:

- [ ] Homepage H1 cleanup
- [ ] Render hero subhead/trust bullets
- [ ] Add explicit English trust facts: free / no account / no limits / browser / offline
- [ ] Rewrite 4 English pages to stop sharing the same middle sections
- [ ] Stop there and measure before doing more
