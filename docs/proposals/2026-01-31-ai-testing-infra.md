# Feature Proposal: AI Testing Infrastructure Foundation

**Date:** 2026-01-31  
**Repo:** GroupMixer  
**Status:** Proposed

---

## Context

From VISION.md: The primary goal is making GroupMixer 100% AI-testable. Currently there's no comprehensive AI-friendly testing infrastructure.

---

## Proposed Features (pick one to start)

### Option A: Storybook Setup for Component Isolation
**Effort:** Small (2-4 hours)

Set up Storybook for the TypeScript webapp to isolate every UI component.

**Why:**
- AI can render each component independently
- Screenshot-based visual testing becomes trivial
- Components are testable without navigating the full app
- Documents all component states automatically

**Deliverables:**
- [ ] Storybook installed and configured
- [ ] Stories for 3-5 core components
- [ ] Build script that outputs static storybook
- [ ] Screenshot capability via Playwright

---

### Option B: URL-Routable Modal/Dialog States  
**Effort:** Small (1-2 hours)

Make all modals and overlays accessible via URL query params.

**Why:**
- AI can navigate directly to any UI state
- No click sequences needed to reach specific states
- Testing becomes deterministic
- Deep-linking improves UX too

**Example:**
- `/?modal=create-group` opens the create group modal
- `/?modal=settings&tab=preferences` opens settings to preferences

**Deliverables:**
- [ ] URL param handler for modals
- [ ] Update existing modals to support URL state
- [ ] Document the URL API

---

### Option C: API Endpoint Test Harness
**Effort:** Medium (3-5 hours)

Create a test client and catalog for all backend API endpoints.

**Why:**
- AI can verify backend independently of frontend
- Contract testing between Rust backend and TS frontend
- Catch backend regressions early

**Deliverables:**
- [ ] List all API endpoints with expected inputs/outputs
- [ ] Test client (can be simple curl scripts or Rust tests)
- [ ] Basic smoke tests for each endpoint

---

## Recommendation

**Start with Option A (Storybook)** — It's the most bang-for-buck for AI testing. Once components are isolated in Storybook, visual regression testing becomes almost trivial.

---

## Next Steps

1. Guido approves one option
2. I implement on a feature branch
3. Open PR for review
4. Merge and move to next feature

