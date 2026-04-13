# solver3 SGP-specialized mode semantics audit

## Purpose

This note audits the current and planned SGP-shaped `solver3` search modes against full GroupMixer scenario semantics.

It is intentionally split into three questions for each mechanism:

1. **semantic validity** — can the mechanism run without lying about the scenario?
2. **likely effectiveness** — is the mechanism still aligned with the actual search geometry?
3. **exposure/readiness** — should we expose it as supported, narrowed/experimental, or unsupported?

This prevents us from conflating:
- *valid but narrow*,
- *valid but unproven*, and
- *actually unsupported*.

## Mechanisms in scope

- **A. SGP week-pair tabu local improver**
  - current implementation surface: `single_state + sgp_week_pair_tabu`
  - memory keyed by `(session_idx, swapped_pair_idx)`
- **B. conflict-position-restricted swap neighborhood**
  - planned SGP-focused neighborhood restriction on swap proposals
- **C. steady-state memetic search with same-session swap mutation + child polish**
  - planned outer driver
  - mutation remains swap-kernel-based in v1

---

## Summary judgment

### A. SGP week-pair tabu local improver
- **semantic validity:** broader than pure SGP, because it only adds search-side memory on swap corridors
- **likely effectiveness:** strongest on swap-dominant, repeat-encounter-heavy workloads
- **exposure/readiness:** **narrowed / experimental**

### B. conflict-position-restricted swap neighborhood
- **semantic validity:** much more SGP-specific because it depends on a repeat-conflict notion at the session/person level
- **likely effectiveness:** plausible only when repeat-conflict localization really matches the score landscape
- **exposure/readiness:** **unsupported outside repeat-heavy SGP-like workloads**

### C. steady-state memetic with same-session swap mutation
- **semantic validity:** the outer-loop idea is broad, but the v1 mutation operator is still swap-dominant and therefore narrow
- **likely effectiveness:** still the most plausible global-search direction for SGP-like workloads
- **exposure/readiness:** **narrowed / experimental** for swap-dominant workloads; not yet a general solver3 mode

---

## Compatibility matrix

Legend:
- **supported** = semantically honest and aligned enough to expose intentionally
- **narrowed** = semantically honest but only under explicit assumptions / experimental framing
- **unsupported** = should fail explicitly rather than silently downgrade

| Scenario semantic surface | A. week-pair tabu local improver | B. conflict-position restriction | C. memetic (swap mutation + child polish) |
|---|---|---|---|
| Pure SGP / repeat-encounter-dominant / full attendance / no cliques | **narrowed** (best fit; benchmarked only here so far) | **narrowed** (best conceptual fit, but not implemented) | **narrowed** (best conceptual fit; strongest next global-search candidate) |
| Partial attendance | **narrowed** | **unsupported** unless conflict definition is explicitly reworked | **narrowed** if swap mutation still has enough feasible mass |
| Immovable assignments | **narrowed** | **unsupported** for now; conflict corridor may become too starved | **narrowed** if enough movable swap mass remains |
| Active cliques / must-stay-together | **unsupported** as an SGP-specialized mode if clique-heavy search geometry dominates | **unsupported** | **unsupported** in v1 if mutation remains swap-only |
| Attribute-balance-heavy workloads | **narrowed** at most; semantically valid but objective alignment unproven | **unsupported** as currently conceived | **narrowed** if child polish is exact and mutation is only treated as diversification |
| Pair-meeting-count-heavy workloads | **narrowed** at most; semantically valid but not obviously aligned | **unsupported** unless conflict semantics are generalized beyond repeat-encounter excess | **narrowed** if mutation/polish remain exact; effectiveness unknown |
| Soft together / apart dominant workloads | **narrowed** at most | **unsupported** | **narrowed** if child polish is exact; effectiveness unknown |
| Transfer-dominant workloads | **unsupported** as a specialized mode because its memory only helps swap corridors | **unsupported** | **unsupported** in v1 if mutation remains swap-only |
| Clique-swap-dominant workloads | **unsupported** as a specialized mode | **unsupported** | **unsupported** in v1 if mutation remains swap-only |

---

## Mechanism-by-mechanism notes

## A. SGP week-pair tabu local improver

### Why it is semantically broader than pure SGP
The memory is attached to the **swap corridor**, not to a fake SGP-only state representation.
It does not change feasibility rules; swap feasibility still comes from:
- participation,
- immovables,
- cliques,
- group capacities,
- exact score preview/apply.

So the mechanism is not invalid merely because the scenario contains richer constraints.

### Why it is still only narrowed/experimental
Its actual memory key is:
- `session_idx`
- `pair_idx(swapped_left, swapped_right)`

That is a good fit when:
- the dominant search geometry is same-session swapping,
- repeated local churn in swap corridors is the problem,
- repeat-encounter structure is a major source of difficulty.

It becomes much less compelling when:
- transfers matter more than swaps,
- clique swaps carry the real diversification mass,
- or score pressure is dominated by non-repeat objectives.

### Current evidence
The first benchmarked configuration:
- preserved throughput roughly well,
- but regressed Social Golfer quality from `5409` to `5451`.

So today it is best described as:
- **semantically honest**,
- **architecturally valid**,
- **not rollout-ready**,
- and still **SGP-first / experimental**.

## B. conflict-position-restricted swap neighborhood

### Why this is much narrower
The paper mechanism is not just “bad pair guidance.”
It depends on **session-local conflict positions**, meaning we need a meaningful notion of:
- who is conflict-involved,
- in which session,
- and why restricting the neighborhood to those positions is still honest.

That aligns naturally with pure SGP repeat conflicts.
It does **not** automatically align with:
- pair-meeting-count targets,
- soft together/apart penalties,
- attribute balance penalties,
- or transfer/clique-swap-driven geometry.

### Important current seam limitation
`PairContactUpdate` currently carries:
- `pair_idx`
- `new_count`

and is **not session-tagged**.
That is enough for global repeat guidance, but not enough by itself for a clean conflict-position cache.

### Audit conclusion
This mode should remain **unsupported outside repeat-heavy SGP-like workloads** until we explicitly define:
- the conflict metadata model,
- the semantics of conflict involvement for richer objectives,
- and the capability gate.

## C. steady-state memetic with same-session swap mutation + child polish

### Separate the outer principle from the v1 mutation operator
The outer memetic idea is broad:
- population
- mutation
- local child polish
- Lamarckian replacement

The **v1 mutation operator** we are planning is narrow:
- several same-session swaps
- over the existing swap kernel

That means the outer architecture is potentially reusable, but the first exposed mode is still only honest for **swap-dominant** scenarios.

### Why this is still the strongest next global-search direction
Current evidence says:
- stronger local guidance improves early descent,
- first tabu memory does not yet improve final SGP quality,
- the missing ingredient still looks like a **basin-transition** mechanism.

That keeps steady-state memetic search as the most plausible next major direction for SGP-like workloads, even though v1 must be narrowly gated.

### Audit conclusion
For v1, treat memetic mode as:
- **narrowed / experimental** for swap-dominant workloads,
- **unsupported** for clique-heavy or transfer-dominant workloads,
- and not yet a general solver3 improvement claim.

---

## Explicit gating candidates surfaced by this audit

These should feed the later capability-gating policy todo.

### Candidate: allow as narrowed / experimental
- `single_state + sgp_week_pair_tabu`
- `steady_state_memetic + record_to_record`
- `steady_state_memetic + sgp_week_pair_tabu`

but only when the scenario is **swap-dominant enough** and does not fundamentally rely on clique-swap/transfer geometry.

### Candidate: fail explicitly as unsupported
- conflict-position restriction when repeat-conflict semantics are not the dominant, well-defined surface
- swap-mutation memetic mode on clique-heavy scenarios where swap moves are nearly vacuous
- swap-specialized advanced modes on workloads whose meaningful search mass lives primarily in transfer/clique-swap families

---

## Consequences for the plan

1. **Do not market the current tabu path as a general solver3 upgrade.**
   It is an SGP-specialized experimental mode with honest but narrow semantics.

2. **Do not advance conflict-position restriction yet as a generic next step.**
   It remains more semantically brittle than week-pair tabu.

3. **Keep memetic work narrowly framed for v1.**
   Build the outer architecture cleanly, but gate the first mutation operator honestly.

4. **Capability gating should happen in normalization, not deep in the hot path.**
   The user/config should see one explicit effective mode, or an explicit failure.
