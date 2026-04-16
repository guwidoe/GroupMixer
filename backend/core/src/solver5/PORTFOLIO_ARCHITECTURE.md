# Solver5 Portfolio Architecture

This document defines the next-level architecture for `solver5` as a
**constructor portfolio platform**.

It complements `ARCHITECTURE.md`, which defines the base module boundaries.
This file defines how new construction families, catalog facts, candidate
metadata, router policy, and eventual search-handoff seams fit together.

## Purpose

Solver5 should evolve as:

1. a **pure-SGP normalizer**
2. a **family portfolio registry**
3. a **candidate evaluator/ranker**
4. a **composition engine** for structural lifts like `+G(t)`
5. an optional **post-construction heuristic layer**
6. an explicit **handoff boundary** to future search-based refinement

It should not evolve as a hidden search fallback or as a pile of ad hoc
special-case code.

## Portfolio contract

### Family registry

Every constructor family should implement the `ConstructionFamily` interface.

A family must expose three distinct concepts:
- identity (`id()`)
- applicability/evaluation (`evaluate(problem)`)
- actual construction (`construct(problem)`)

This split is mandatory. Do not collapse evaluation and construction back into a
single opaque function.

### Family responsibilities

A family module may:
- encode family-local math
- declare eligibility assumptions
- construct typed `ConstructionResult`s
- attach truthful candidate metadata

A family module may not:
- own router precedence policy
- hardcode benchmark-specific answers
- hide exception tables inline when they belong in the catalog layer
- silently trigger search fallback

## Candidate metadata semantics

Every constructed candidate should carry metadata that answers:
- how strong is this construction?
- what evidence/source backs it?
- is it general, conditional, or exceptional?
- what residual structure remains available for composition?

### Quality model

Use `ConstructionQuality` to distinguish:
- `ExactFrontier`
- `NearFrontier`
- `LowerBound`

Router policy may rank on this metadata, but quality annotations must remain
truthful even when they are not yet used for a final decision.

### Evidence model

Use `ConstructionEvidence` / `EvidenceSourceKind` to distinguish:
- theorem-family evidence
- finite-field based constructions
- structural composition
- catalog-backed facts
- patch-bank constructions

Do not bury theorem/table provenance in comments alone when it should affect how
future contributors reason about the candidate.

### Applicability model

Use `ConstructionApplicability` to distinguish:
- broad/general families
- conditionally available families
- exceptional or patch-style families

This matters because a family like RTD/MOLS behaves differently from a small
exception patch bank even when both happen to produce a construction.

### Residual structure

Use `ResidualStructure` when a candidate leaves behind a reusable structural
opportunity, such as latent groups that can be filled recursively.

Do not model recursive opportunities as implicit router folklore.

## Catalog ownership rules

All theorem tables, exception sets, patch banks, and similar source-backed facts
belong in `solver5/catalog/`.

Examples:
- supported finite-field orders
- dedicated `p=4` exception sets
- RBIBD / RGDD / URD / RITD summary facts
- ownSG starter-block banks

Catalog modules should expose:
- typed facts
- a source/citation handle
- no router policy

Catalog modules are for **facts**, not decisions.
The router decides how to use facts; families decide how to construct from them.

## Router ranking policy

The router is the single owner of portfolio selection policy.

Current policy shape:
1. enumerate registered families
2. collect applicable candidates
3. compare candidates by:
   - supported weeks
   - candidate quality
   - stable registry precedence
4. report weaker rejected candidates explicitly
5. fail truthfully when no candidate can satisfy the requested week count

As solver5 grows, keep ranking policy explicit and inspectable.
Do not spread family-selection logic back into constructors.

## Composition vs family vs patch-bank boundaries

### Family
A family is an explicit mathematical constructor with a coherent applicability
region.

Examples:
- round robin
- Kirkman / NKTS
- affine plane
- RTD / MOLS
- dedicated `p=4` branches

### Composition operator
A composition operator transforms or extends a family result structurally.

Examples:
- recursive latent-group fill
- future RGDD or clique-fill based `+G(t)` extensions

Composition operators should be reusable and provenance-visible.

### Patch bank
A patch bank is a catalog-backed set of explicit exceptional constructions.

Examples:
- ownSG starter blocks
- one-off URD-derived exceptional fills

Patch banks are allowed, but they must stay catalog-backed, typed, and honest.
They are not an excuse for benchmark-specific hardcoding.

## Search-handoff policy surface

Solver5 remains construction-only today.

Even so, future work may want the flow:
- construct best candidate
- package seed payload
- decide whether handoff to search is allowed

That is why `handoff.rs` exists.

Rules:
- do not silently enable fallback search
- keep policy explicit
- keep seed provenance and quality visible
- preserve truthful unsupported behavior when handoff is disabled

## Family onboarding workflow

When adding a new family (e.g. NKTS or dedicated `p=4` routing):

1. add/update any source-backed facts in `catalog/`
2. add a dedicated module under `families/`
3. implement `ConstructionFamily`
4. attach candidate metadata truthfully
5. add family-level tests
6. register the family in the portfolio registry
7. add/update router tests for ranking and truthful rejection behavior
8. run solver5 benchmark coverage honestly
9. document any important exception behavior in the architecture docs

## Recommended next family buildout order

With the portfolio platform in place, the next additions should be:

1. **NKTS / composite `p=3` coverage**
2. **general router enrichment so each important `p` has explicit family-selection policy**, with `p=4` as the next high-ROI gap in practice
3. broader RBIBD / RGDD / URD / RITD / ownSG patch integration

## Non-goals

- hidden fallback to solver3/solver4 search
- benchmark-specific answer banks disguised as patch families
- mixing theorem facts directly into router code
- re-monolithizing family logic into one giant orchestrator file
