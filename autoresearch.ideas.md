# Autoresearch ideas: solver4 32x8x10

- Keep the current breakout shape simple: untabued, conflict-anchored, and concentrated on the hard week. Avoid revisiting already-regressive variants such as reactive second-swap recomputation, forced cross-week spreading, random donor-slot breakout endpoints, any global/week-local tabu reset on breakout, same-week group-spreading constraints for the second breakout swap, or broad tabu aspiration.
- The current breakout win seems to come from eliminating direct self-overlap, not from enforcing broader coverage. If breakout is revisited again, only try similarly low-bias perturbation-efficiency tweaks that do **not** impose extra spread structure.
- Best-so-far stagnation counting plus 4+ late repeat-guidance is the new baseline. Threshold/timing retunes should only be considered under that regime, not as a return to the old current-step-reset behavior.
- Constructor work should stay away from shallow screening/filtering. Best-of-two initializer selection by local paper metrics regressed badly; any future constructor work should preserve basin diversity rather than pre-optimizing the seed schedule.
- If tabu is revisited, prefer the opposite of the already-failed shortening experiment or a more conditional scheme. The current baseline still seems to like stronger short-term memory more than weaker memory.
