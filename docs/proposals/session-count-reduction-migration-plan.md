# Session-count reduction migration plan

## Problem

Reducing `scenario.num_sessions` is currently a raw shape change in the Scenario Editor. The current handler updates the session count but does not migrate or review session-dependent data.

This creates a correctness gap:

- some frontend views silently normalize away out-of-range sessions
- some edit flows trim session lists only when a row is re-saved
- the backend/solver validates session indices honestly and can reject the scenario later
- naive normalization can silently broaden meaning, especially when an explicit session subset becomes empty and the app interprets `undefined` as `all sessions`

This is especially dangerous for constraints and people whose session scoping is semantically meaningful.

## Goals

1. Make session-count reduction an explicit, reviewable migration.
2. Preserve semantics where the migration is unambiguous.
3. Never silently broaden a scoped concept into `all sessions`.
4. Surface destructive or ambiguous consequences before applying them.
5. Apply the migration atomically so the scenario never sits in a half-invalid state.
6. Invalidate derived runtime state that no longer matches the new scenario shape.

## Non-goals

- Changing behavior when the session count increases.
- Changing backend validation semantics.
- Introducing hidden fallback behavior that auto-repairs ambiguous constraints without user approval.

## Current risk areas

When sessions are reduced, stale or invalid data can remain in:

- `Person.sessions`
- `Group.session_sizes`
- session-scoped constraints:
  - `ImmovablePeople`
  - `MustStayTogether`
  - `MustStayApart`
  - `ShouldStayTogether`
  - `ShouldNotBeTogether`
  - `AttributeBalance`
  - `PairMeetingCount`
- solver settings with session scope:
  - `settings.allowed_sessions`
- active derived state:
  - active solution
  - warm-start selection
  - manual-editor draft/evaluation state

## Core design

Add a single pure migration planner that computes the full impact of reducing sessions before any state is committed.

Proposed location:

- `webapp/src/services/sessionCountMigration.ts`

Proposed primary API:

```ts
planSessionCountReduction(args: {
  scenario: Scenario;
  nextSessionCount: number;
}): SessionCountReductionPlan
```

Proposed shape:

```ts
interface SessionCountReductionPlan {
  previousSessionCount: number;
  nextSessionCount: number;
  nextScenario: Scenario;
  summary: {
    peopleTrimmed: number;
    groupsTrimmed: number;
    constraintsTrimmed: number;
    constraintsRemoved: number;
    pairMeetingConstraintsNeedingReview: number;
    allowedSessionsTrimmed: boolean;
  };
  changes: SessionReductionChange[];
  blockers: SessionReductionBlocker[];
  invalidations: SessionReductionInvalidation[];
}
```

The important property is that the planner returns both:

- the migrated scenario shape when the reduction is allowed
- explicit blockers/removals/review items when the reduction is destructive or ambiguous

## Migration rules by data type

### 1. Groups

#### `group.session_sizes`

Rule:

- truncate to the first `nextSessionCount` entries
- if the truncated array is empty, store `undefined`
- preserve `group.size`

This is a safe structural trim and can be auto-applied.

### 2. People

#### `person.sessions`

Rule:

- `undefined` means all sessions and remains unchanged
- explicit session subsets are intersected with `[0 .. nextSessionCount - 1]`

If the result becomes empty:

- do **not** convert to `undefined`
- create a blocker because that would either broaden semantics or create a person with no remaining participation

User resolution should be explicit:

- remove the person
- edit their participation
- cancel the session reduction

### 3. Constraints with optional session subsets

Applies to:

- `MustStayTogether`
- `MustStayApart`
- `ShouldStayTogether`
- `ShouldNotBeTogether`
- `AttributeBalance`
- `ImmovablePeople`

Rule:

- `undefined` remains `undefined` (`all sessions` still means all remaining sessions)
- explicit subsets are intersected with the new session range

If the intersected subset becomes empty:

- do **not** serialize `undefined`
- treat the constraint as no longer applicable anywhere
- mark it as a planned removal in the migration plan
- require explicit confirmation in the reduction review UI

This preserves truthfulness and avoids the `empty -> all sessions` bug.

### 4. `PairMeetingCount`

This constraint needs stronger review because session reduction can invalidate its target semantics.

Rule:

- trim explicit session subsets like other scoped constraints
- if the resulting explicit subset is empty, mark for removal
- otherwise recompute the effective session horizon for that constraint
- recompute the maximum allowed target from remaining sessions
- recompute feasible co-participation for the pair when applicable

If `target_meetings` is now invalid or impossible:

- create a blocker
- require explicit user action to either:
  - edit the target, or
  - remove the constraint

Do **not** silently clamp the target.

### 5. `RepeatEncounter`

No session-list migration is needed.

Its semantics naturally follow the new total session horizon.

### 6. Solver settings

#### `settings.allowed_sessions`

Rule:

- if undefined, leave unchanged
- otherwise intersect with the new session range

If the result becomes empty:

- create a blocker or explicit review item
- do **not** silently reinterpret it

Preferred resolution:

- clear `allowed_sessions` explicitly, or
- edit the selection, or
- cancel the reduction

### 7. Derived runtime/editor state

Changing the session horizon invalidates shape-dependent runtime state.

The plan should emit invalidations for:

- current solution
- warm-start selection
- manual-editor draft/evaluation derived from the old scenario
- any solve-in-progress assumptions that depend on the old scenario snapshot

Saved historical results can remain as snapshots, but the active workspace should not keep pretending they match the current scenario.

## UX plan

## A. Intercept only reductions

When the user changes sessions:

- if `nextSessionCount >= currentSessionCount`, apply immediately
- if `nextSessionCount < currentSessionCount`, compute a reduction plan and open a review flow instead of applying immediately

## B. Review modal

Add a dedicated review modal for reductions, e.g.:

- `webapp/src/components/modals/ReduceSessionsReviewModal.tsx`

The modal should show:

- old vs new session count
- summary counts
- grouped detail sections:
  - people affected
  - groups trimmed
  - constraints trimmed
  - constraints removed
  - blockers requiring action
  - runtime state that will be cleared

Actions:

- `Cancel`
- `Apply reduction`
- optionally `Review blockers` / deep links when blockers exist

Behavior:

- if blockers exist, disable apply
- if only destructive removals exist, allow apply with explicit confirmation

## C. Wording requirements

The UI copy must make the semantics truthful.

Examples:

- “2 constraints will be removed because they only applied to deleted sessions.”
- “1 pair-meeting target is no longer achievable after reducing sessions.”
- “Current solver result will be cleared because it no longer matches the scenario shape.”

Avoid vague wording like “some settings may change.”

## State integration plan

### Scenario editor controller

Update `handleSessionsCountChange` in:

- `webapp/src/components/ScenarioEditor/useScenarioEditorController.ts`

New behavior:

- increases: apply directly
- reductions: compute plan and open review modal
- confirmation: atomically apply `plan.nextScenario` and clear/invalidate dependent state

### Store/runtime integration

Decide one explicit place to clear invalidated runtime state. Preferred approach:

- add a focused store action or editor action for “apply migrated scenario and invalidate shape-dependent runtime state”

This keeps invalidation rules centralized instead of spreading them through modal code.

## Testing plan

### Unit tests for migration planner

Add focused tests for:

- group session-size truncation
- person session trimming
- explicit subset becoming empty does **not** become `all`
- all-session constraints stay all-session after reduction
- `PairMeetingCount` becomes blocking when target exceeds remaining scope
- `allowed_sessions` trimming and empty-result review path
- summary counts and invalidation markers

### Component tests for review modal / editor flow

Add tests for:

- decreasing session count opens review instead of applying immediately
- reductions with only safe trims can be confirmed
- reductions with removals show truthful summary
- reductions with blockers cannot be confirmed
- cancelling leaves scenario unchanged
- confirming applies new scenario and clears active runtime state

### Regression tests

Add end-to-endish editor/store tests covering:

- a `MustStayApart` subset scoped only to removed sessions gets removed, not broadened
- a person scoped only to removed sessions is surfaced as a blocker
- a `PairMeetingCount` target that was valid before reduction becomes a blocker after reduction

## Suggested implementation slices

### Slice 1: planner + types

- add migration planner service and tests
- no UI changes yet

### Slice 2: review modal + controller wiring

- intercept session reductions
- present plan in review modal
- block unsafe confirmation when blockers exist

### Slice 3: invalidation plumbing

- clear active solution / warm start / manual editor state on confirmed reduction
- add coverage for derived-state reset behavior

### Slice 4: copy polish and edge-case cleanup

- refine summary wording
- add any missing scenario-specific review details

## Acceptance criteria

- Reducing sessions never silently leaves out-of-range session references in the active scenario.
- Reducing sessions never silently broadens explicit session subsets into `all sessions`.
- Session reductions with destructive consequences are reviewed before apply.
- Session reductions with semantic blockers cannot be applied without explicit resolution.
- Pair-meeting constraints are revalidated against the reduced session horizon.
- Active runtime/editor state that no longer matches scenario shape is explicitly invalidated.
- The behavior is covered by unit and UI tests.
