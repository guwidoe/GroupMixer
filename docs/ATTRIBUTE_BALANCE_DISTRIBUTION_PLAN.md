# AttributeBalance distribution editor plan

## Goal

Replace the current per-value numeric stack with a distribution-first editing model that matches how users think about the constraint:

- one ordered horizontal partition bar
- one segment per attribute option in definition order
- one terminal `Not allocated` segment
- integer step editing on group-capacity units
- compact manual controls for precise edits and intentional over-allocation

## Canonical bucket model

Given an attribute definition with option values:

```ts
['female', 'male', 'non-binary']
```

The editor uses this canonical ordered bucket list:

```ts
[
  { key: 'female', kind: 'attribute' },
  { key: 'male', kind: 'attribute' },
  { key: 'non-binary', kind: 'attribute' },
  { key: '__unallocated__', label: 'Not allocated', kind: 'unallocated' },
]
```

Rules:
- order is fixed and comes from the attribute definition order
- `Not allocated` is always the final bucket
- every bucket always exists logically, even if its visible width is `0`
- divider semantics also stay in fixed order, even when an intermediate segment is collapsed

## Persisted mapping

Persisted `AttributeBalance.desired_values` stores only attribute buckets.

- attribute bucket count `> 0` -> persisted in `desired_values`
- attribute bucket count `=== 0` -> omitted from `desired_values`
- `Not allocated` is never persisted directly

Derived helper values:
- `allocatedTotal = sum(attribute bucket counts)`
- `unallocatedCount = max(capacity - allocatedTotal, 0)`
- `overallTotal = allocatedTotal + unallocatedCount`
- `isOverallocated = allocatedTotal > capacity`

Visual model rules:
- when `allocatedTotal <= capacity`, the bar partitions exactly `capacity` units
- when `allocatedTotal > capacity`, the bar still only partitions `capacity` units for drag editing
- in overallocated state, the manual controls remain authoritative and drag is disabled or clamped to the non-overallocated projection until counts return within capacity

## Divider model

The partition bar is represented by bucket counts, not by free-floating percentages.

For ordered bucket counts:

```ts
[2, 0, 1, 3]
```

logical dividers are the prefix sums:

```ts
[2, 2, 3]
```

This means:
- a zero-width middle segment does not remove its logical divider
- dragging the boundary between visible `female` and visible `non-binary` first revives `male`
- repartitioning from `female` to `non-binary` without touching `male` requires two drag steps, which is intentional because option order is canonical

Drag rule for divider `i`:
- it moves on an integer grid `0..capacity`
- it cannot cross divider `i - 1` or `i + 1`
- moving it updates only the two adjacent logical partitions implied by the fixed-order bucket list
- drag interaction never increases `allocatedTotal` above `capacity`

## Group-capacity resolution

The editor needs one capacity number for the partition bar.

For the selected group and selected session scope:

1. resolve the applicable sessions
   - if session scope is `all`, use all scenario sessions
   - otherwise use the selected explicit session list
2. resolve the group capacity for each applicable session
   - use `group.session_sizes[session]` when present
   - otherwise fall back to `group.size`
3. editor capacity = minimum applicable capacity

Why minimum:
- one `desired_values` distribution is shared across the selected sessions
- using the minimum avoids generating a default distribution that is infeasible in some selected sessions
- if capacities differ across selected sessions, UI should show a subtle note that the editor uses the smallest applicable capacity

If no valid group or session exists, fall back to `group.size ?? 0`.

## Availability counting for defaults

Defaults are only for new constraints or untouched draft state after upstream selection changes.

Relevant population:
- use people participating in at least one applicable selected session
- if a person has explicit `sessions`, include them if they overlap the selected session scope
- if a person has no explicit `sessions`, treat them as available in all sessions

For each relevant person:
- resolve the selected attribute value
- if the value is missing / blank / not assigned, count it toward `Not allocated`
- if the value is present but not in the current attribute definition values, also count it toward `Not allocated`

This produces a source availability distribution across:
- all attribute options
- `Not allocated`

## Default apportionment

Use largest remainder / Hamilton apportionment.

Inputs:
- ordered source bucket counts including `Not allocated`
- editor capacity

Algorithm:
1. if total source count is `0`, default to all units in `Not allocated`
2. compute proportional quotas for each bucket:
   - `quota = (sourceCount / totalSourceCount) * capacity`
3. take floors for every bucket
4. distribute remaining units to the largest fractional remainders
5. break exact remainder ties by canonical bucket order

This guarantees:
- integer counts
- sum exactly equals editor capacity
- missing/N/A people influence the default `Not allocated` share

Persisted default result:
- only attribute buckets are saved in `desired_values`
- `Not allocated` remains derived

## Create vs edit behavior

Create mode:
- seed from smart default once group, attribute, and session scope are all known
- if the user has not manually edited the distribution yet, reseed when those upstream inputs change
- once the user edits counts or drags a divider, mark the draft as customized and stop auto-reseeding

Edit mode:
- preserve existing `desired_values`
- derive `Not allocated` from current capacity
- do not auto-reseed when upstream values change unless the user explicitly resets to suggested distribution

## Manual edit policy

Manual controls exist for all buckets, including zero buckets and `Not allocated`.

Behavior:
- zero buckets remain directly editable even if visually collapsed in the bar
- direct edits may intentionally create over-allocation
- over-allocation is allowed to preserve current product flexibility
- when overallocated:
  - show a warning summary such as `Allocated 7 / capacity 5`
  - drag editing is disabled or clamped to the first `capacity` units only
  - save remains allowed, matching current semantics

Recommended manual affordances:
- compact per-bucket chips/cards
- decrement button
- current count
- increment button
- optional direct text input on focus

## Suggested helper boundaries

Pure helpers:
- `getAttributeDistributionBuckets(definitionValues: string[]): DistributionBucket[]`
- `getApplicableSessions(sessionScope, totalSessions): number[]`
- `getGroupCapacityForSessions(group, sessions): number`
- `getRelevantPeopleForSessions(people, sessions): Person[]`
- `countAvailableAttributeDistribution(people, definitions, selector, buckets): Record<string, number>`
- `apportionDistributionByLargestRemainder(sourceCounts, capacity): Record<string, number>`
- `desiredValuesToBucketCounts(desiredValues, buckets, capacity): Record<string, number>`
- `bucketCountsToDesiredValues(bucketCounts): Record<string, number>`
- `getDividerPositions(bucketCounts): number[]`
- `moveDivider(bucketCounts, dividerIndex, nextPosition, capacity): Record<string, number>`
- `applyManualBucketDelta(bucketCounts, key, delta): Record<string, number>`
- `summarizeDistribution(bucketCounts, capacity): { allocatedTotal, unallocatedCount, isOverallocated }`

Component boundaries:
- `AttributeDistributionField`
  - renders partition bar
  - handles pointer/keyboard divider editing
  - renders manual chips/compact controls
  - emits updated attribute bucket counts
- modal integration owns
  - selected group/attribute/session scope
  - smart default seeding
  - persistence back to `desired_values`

## Validation expectations

Tests should prove:
- missing attribute assignments feed `Not allocated`
- minimum selected-session capacity is used
- largest remainder produces deterministic integer totals
- zero-width intermediate buckets preserve divider order
- drag cannot over-allocate
- manual edits can over-allocate
- create mode reseeds only before customization
- edit mode preserves existing values
