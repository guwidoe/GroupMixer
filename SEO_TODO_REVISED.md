# SEO TODO — revised after latest conclusions

_Date: 2026-04-23_

This version reflects the newer conclusion:

- keep the landing pages **tool-first**
- stop treating many near-keyword-clone landing pages as the main SEO strategy
- **do not delete them yet**, but also **do not keep pouring work into differentiating them**
- shift the main SEO effort toward **guides / use-case docs / how-to pages**

---

## Current strategic conclusion

Search Console is currently telling us:

- the homepage is the main organic winner
- localized homepages get some traction
- extra English leaf pages are not proving themselves yet

So the working strategy is now:

- **keep** the existing leaf pages live for now
- **freeze** major investment in making each one a separate SEO winner
- put new content effort into **evergreen use-case guides** that explain problems the tool solves well

This is a shift from:

- "make lots of landing pages rank"

To:

- "let the homepage + a few core tool pages carry tool intent, and let guides/docs capture richer long-tail use cases"

---

## P0 — Fix the homepage H1 implementation without losing the animation

- [ ] **Keep the animation, but make the crawlable H1 static**
  - Goal H1 text:
    - `Group Generator - Random, Balanced & Multi-Round`
  - Files:
    - `webapp/src/components/LandingPage/HomeAnimatedHeroTitle.tsx`
    - `webapp/src/pages/ToolLandingPage.tsx`
  - Why:
    - The main homepage issue now looks like the **implementation** of the H1, not the wording.
    - The rotating words should not live inside the actual crawl-critical H1 text.
  - Done when:
    - The prerendered homepage HTML contains one clean static H1.
    - The animation still exists visually, but outside the real H1 text node.
  - Notes: Approved

- [ ] **Verify the homepage H1 in built/prerendered output**
  - Check:
    - built HTML
    - inspector on initial load
  - Done when:
    - Copy/paste of the actual H1 returns the clean static phrase.
  - Notes: Approved

---

## P1 — Improve English FAQ substantially

- [ ] **Expand the English FAQ with the missing practical questions**
  - File:
    - `webapp/src/i18n/landing/en.ts`
  - Add or tighten answers for:
    - Is GroupMixer free?
    - Are there usage limits?
    - Do I need an account?
    - Where is my data processed?
    - Does it work offline after first load?
    - Can I avoid repeat pairings across rounds?
    - Can I keep people together or apart?
    - Can I balance by CSV attributes?
    - Can I fix specific people to groups?
    - When should I use the scenario editor?
  - Why:
    - FAQ is the accepted place for this information.
    - English still lags FR/JA in clarity.
  - Done when:
    - English FAQ answers the obvious product questions clearly and non-salesily.
  - Notes: Approved

- [ ] **Use FR/JA as factual source material, without copying tone blindly**
  - Files:
    - `webapp/src/i18n/landing/fr.ts`
    - `webapp/src/i18n/landing/ja.ts`
    - `webapp/src/i18n/landing/en.ts`
  - Done when:
    - English matches them on factual clarity for privacy/offline/limits/account.
  - Notes: Yes, we should have everything we have in other languages in english too. dont edit the other languages for now.

---

## P1 — Start the new main lane: guides / use-case pages

- [ ] **Choose a content section structure for guide-style SEO pages**
  - Options:
    - `/guides/...`
    - `/use-cases/...`
  - Recommendation:
    - prefer something like `/guides/` or `/use-cases/` over a generic blog framing
  - Why:
    - These pages should feel like practical playbooks, not generic marketing posts.
  - Done when:
    - One URL pattern is chosen and reused consistently.
  - Notes: Approved

- [ ] **Define the first 3–5 guide topics**
  - Strong candidates:
    - how to avoid repeat pairings in workshops
    - how to run speed networking rounds
    - how to make balanced student groups
    - random groups vs balanced groups vs constrained groups
    - how to split a class into fair groups
  - Why:
    - These topics map to real use cases and showcase what GroupMixer does unusually well.
  - Done when:
    - There is a short ranked list of which guide pages to build first.
  - Notes: Approved


---

## P1.5 — Connect the guides back into the tool cleanly

- [ ] **Add internal links from guides to the most relevant tool entry points**
  - Why:
    - The guide pages should support the tool, not float independently.
  - Done when:
    - Each guide has one clear, natural CTA into the appropriate GroupMixer flow.
  - Notes:Approved

- [ ] **Add internal links from tool pages to the relevant guides**
  - Likely places:
    - homepage
    - relevant tool landing pages
    - FAQ answers where natural
  - Why:
    - This is a better use of supporting content than a generic related-tools block alone.
  - Done when:
    - At least the homepage and one relevant landing page link to the first guide.
  - Notes:Approved


## P2 — Verify app-route noindex in the real world

- [ ] **Check why old app routes still appear in Search Console**
  - Files/code already look mostly correct:
    - `webapp/src/MainApp.tsx`
    - `webapp/src/seo/seoDocument.ts`
  - Check:
    - whether the noindex version is deployed
    - whether Google has re-crawled since deployment
    - whether prerendered `/app` output is correct in production
  - Why:
    - Search Console still shows old app routes.
    - This may be stale indexing, but should be verified once.
  - Done when:
    - We know whether this is just lag or a real issue.
  - Notes:Approved

---

## P3 — Optional later items

- [ ] **Add site-level `WebSite` / `Organization` schema**
  - File:
    - `webapp/src/seo/seoDocument.ts`
  - What we already know:
    - site name: `GroupMixer`
    - brand/project name: `GroupMixer`
    - owner/person behind it: personal project by you
  - Why:
    - This gives Google a cleaner structured-data statement of site identity and project ownership.
  - Priority:
    - low
  - Notes: Approved optional later work.

- [x] **Do not rewrite the meta descriptions right now**
  - File:
    - `webapp/src/i18n/landing/en.ts`
  - Why:
    - You are happy with the current meta descriptions and already spent significant time on them.
    - There is no strong enough problem signal to justify reopening that work now.
  - Notes: Explicitly out of scope for the current SEO pass.

---

---

## One-sentence strategy summary

**Keep the existing tool landing pages live, stop overinvesting in making each one rank separately, and move the main SEO effort into practical guide/use-case pages that showcase where GroupMixer is actually stronger than simple randomizers.**
