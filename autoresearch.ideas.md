# Solver3 construction autoresearch ideas backlog

- Implement an oracle-guided baseline fill rather than overwrite+repair: preserve immovables/cliques, then fill flexible slots using real objective marginal plus projected oracle-contact agreement.
- Add merge acceptance scoring based on estimated search-basin disruption, not final-score gating: prefer oracle placements that keep scaffold-stable/cohesive groups and avoid moving people outside the selected template region.
- Explore small, principled scaffold-disruption weights around the current best 3x setting; 2x improved Sailing/raw total but hurt broad log via small constrained cases, while 5x was too conservative.
- Evaluate multiple top template candidates cheaply by projection/merge risk before invoking solver6 when the top-ranked candidate is high-disruption; keep deterministic and generic, no case-specific branches.
- Add benchmark telemetry for oracle outcome/template dimensions per case to understand whether regressions come from candidate choice, projection, merge displacement, or hard repair.
- Investigate making accepted-template targets prefer in-region moves more strongly and outside-region pulls less often, to preserve baseline search basins while still injecting contact structure.

## De-emphasized / recently negative

- Whole-problem pure-SGP fast path before scaffold/template logic: explicitly rejected.
- User-facing projection/oracle knobs: not allowed; behavior must be automatic.
- Score-gated oracle acceptance or hidden fallback after merge/repair claims applicability: not allowed during this strict constructor phase.
- More aggressive scaffold-disruption penalty at 5x: worsened the broad log score versus the 3x keep.
- More permissive disruption penalty at 2x: improved Sailing/raw total but worsened broad log aggregate and constrained SGP balance.
