# Autoresearch ideas: solver3 broad multiseed quality

## Active shortlist
- Inspect family-usage / acceptance telemetry for the remaining weak cases, especially `stretch.large-gender-immovable-110p` and the partial-attendance lanes, before changing chooser policy again.
- If move-family selection still needs refinement, try **small tie-break signals** from recent improving accepts rather than feeding productivity directly into target-share mass.
- Consider lightweight per-family floor allocation / exploration guarantees only if telemetry shows a structurally important family is still being starved under the current rejected-preview-penalty policy.
- Re-measure whether sampled `swap` should keep `preview_swap_runtime_trusted(...)` or return to checked preview, but only if chooser-policy work stalls; the checked path was close but not better.
- Investigate whether a small diversification / exploration tweak helps the broad lane without globally lowering exploration too far.

## Pruned / stale for now
- Do **not** reintroduce a separate no-candidate penalty; candidate-rate/share correction was enough and the extra penalty overcorrected.
- Do **not** weaken the rejected-preview penalty below the current stronger setting; `0.08` gave back too much quality.
- Do **not** blend improving-accept rate directly into target-share weighting; that destabilized Sailing and the transfer-heavy adversarial lane.
- Do **not** reduce exploration epsilon globally to `0.03`; that improved runtime but reintroduced the bad Sailing path-dependence failure.
