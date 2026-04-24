# Solver3 construction autoresearch ideas backlog

## Preferred structural experiments

- Implement an oracle-guided baseline fill rather than overwrite+repair: preserve immovables/cliques, then fill flexible slots using real objective marginal plus projected oracle-contact agreement.
- Add merge acceptance scoring based on estimated search-basin disruption, not final-score gating: prefer oracle placements that keep scaffold-stable/cohesive groups while preserving the kept stronger outside-region move penalty.
- Re-evaluate small, principled scaffold-disruption weights only if paired with a structural candidate-risk/fill-order change; simple scalar retuning has had diminishing returns.
- Evaluate multiple top template candidates cheaply by projection/merge risk before invoking solver6 when the top-ranked candidate is high-disruption; keep deterministic and generic, no case-specific branches.
- Add benchmark telemetry for oracle outcome/template dimensions per case to understand whether regressions come from candidate choice, projection, merge displacement, or hard repair.
- Investigate same-region acceptance scoring beyond the kept outside-region penalty: e.g. tune selected-region move bonus or current-group keep bonus under the relative metric, without case-specific branches.

## De-emphasized / recently negative

- Whole-problem pure-SGP fast path before scaffold/template logic: explicitly rejected.
- User-facing projection/oracle knobs: not allowed; behavior must be automatic.
- Score-gated oracle acceptance or hidden fallback after merge/repair claims applicability: not allowed during this strict constructor phase.
- More aggressive scaffold-disruption penalty at 5x under the old log metric: worsened versus the 3x keep.
- More permissive disruption penalty at 2x/2.5x under the old log metric: improved Sailing/raw total in some runs but worsened old aggregate and constrained SGP balance.
