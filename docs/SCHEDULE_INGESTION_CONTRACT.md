# Schedule ingestion contract

This document defines the authoritative meaning of schedule-bearing solver inputs.

## Terms

### Incumbent warm start
A **complete, already-valid schedule** supplied to the solver as the exact starting incumbent.

Properties:
- all sessions must be present
- all groups must be present in each session, even when empty
- every participating person must appear exactly once per participating session
- non-participating people must not be assigned
- group capacities must not be exceeded
- hard-constraint validity is required
- the solver must either accept the schedule as-is or reject it with a clear error
- the solver must not silently repair, reinterpret, or complete a warm start

### Construction seed
A **partial or advisory schedule-like input** supplied only to the shared construction heuristic.

Properties:
- may omit sessions, groups, and/or people if the API surface explicitly allows that
- is not an incumbent
- is not assumed to be complete
- the constructor may complete it into a full schedule or reject it
- the completed result must be validated before it becomes solver state

## API fields

### `initial_schedule`
Meaning:
- **incumbent warm start only**

Rules:
- must be complete
- must be structurally valid
- must satisfy hard constraints
- if invalid, return an explicit error

Backward-compatibility policy:
- the field name remains for the incumbent-warm-start meaning because it is already public and widely used
- legacy constructor-seed behavior must be removed from this field

### `construction_seed_schedule`
Meaning:
- **construction seed only**

Rules:
- optional
- may be partial/advisory
- only construction/bootstrap flows may consume it
- must not be conflated with incumbent warm-start semantics

## Mutual exclusivity

`initial_schedule` and `construction_seed_schedule` must not both be present in the same request.

If both are supplied, reject the input explicitly.

## Validation contract

### Warm-start validation
A valid warm start must pass:
- schedule shape/completeness checks
- participant assignment checks
- group-capacity checks
- no duplicate-assignment checks
- hard-constraint checks required for a truthful incumbent

### Construction-seed validation
A construction seed must pass only the structural checks required for the constructor to interpret it safely, such as:
- valid session keys
- known group IDs
- known person IDs
- no duplicate assignment within a session
- no assignment of non-participating people
- no immediate capacity overfill within the explicitly provided placements

Construction-seed validation does **not** mean the seed is already a valid incumbent.

## Product/API semantics

### Solve
- without `initial_schedule` or `construction_seed_schedule`: construct a fresh valid schedule, then search
- with `initial_schedule`: validate and load the incumbent schedule directly, then search
- with `construction_seed_schedule`: run the shared constructor from the seed, validate the completed schedule, then search

### Evaluate
- requires `initial_schedule`
- rejects `construction_seed_schedule`
- evaluates the supplied incumbent schedule exactly; it does not construct missing assignments

### Benchmark helper / benchmark-start cases
- if they represent a full valid schedule used as a deterministic starting incumbent, they may use `initial_schedule`
- if they exist only as constructor preassignments or bootstrap hints, they must use `construction_seed_schedule`

## Naming and truthfulness rule

If an input can be incomplete or requires solver-side completion, it is **not** a warm start.
It must be named and handled as a construction seed.
