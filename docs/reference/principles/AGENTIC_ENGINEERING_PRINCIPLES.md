# Agentic Engineering Principles

This document is a **master reference** for building software repositories that
are meant to be developed, operated, and evolved with AI agents.

It combines two ideas:

1. **agent-ready / agent-first software** — software an agent can actually use,
   inspect, and debug as a first-class operator
2. **strong engineering principles** — architecture rules that keep the system
   explicit, truthful, testable, and extensible over time

It is intentionally **repo-agnostic**.

Use it as a normative reference when you want agents to build or modify systems
without relying on tribal knowledge, hidden defaults, vague behavior, or human
UI interpretation.

This is the **canonical combined reference** in this folder.

If you want a narrower companion document instead:

- use `AGENT_FIRST_PRINCIPLE.md` for the agent-operator and interface standard,
- use `GENERAL_ENGINEERING_PRINCIPLES.md` for the architecture principles
  without the fuller agent-operability framing.

Some overlap between the three files is intentional. They are optimized for
slightly different use cases.

---

## Status of this document

These principles are **normative**, not aspirational.

If a convenience shortcut, legacy implementation, or undocumented workflow
conflicts with these principles, the principles win.

---

## Core idea

An agent-ready repository is one where a capable agent can:

1. **discover** what the system can do,
2. **understand** how to use it correctly,
3. **execute** tasks through stable interfaces,
4. **inspect** state, outputs, and intermediate artifacts,
5. **recover** from errors without guessing,
6. **follow the same real capabilities and safety model** as a human operator.

The system should not assume a human will:

- fill in missing context,
- interpret vague output,
- remember undocumented conventions,
- click around a UI to discover the real state,
- or manually correct hidden ambiguity after the fact.

If an agent cannot reliably use an important feature through the exposed system
interfaces and built-in documentation, that feature is not truly agent-ready.

## Two agent roles matter

These principles are meant to support **two different kinds of agents**.

### 1. Builder agents

These agents **do have repository access**.
They implement, modify, test, verify, and evolve the software.

They need:

- clear architecture,
- explicit contracts,
- good docs,
- reproducible tests,
- inspectable behavior,
- and honest boundaries.

### 2. Operator agents

These agents may **not** have repository access at all.
They operate the software through whatever the software itself exposes.

They need:

- real control surfaces,
- built-in guidance,
- inspectable state,
- explicit errors,
- stable IDs and workflows,
- and the normal permission model.

This distinction is critical:

> repository access is useful for builders, but it is **not part of the
> contract** for operators.

A good agentic system supports both:

- the **repository** should be easy for builder agents to understand and modify,
- the **software itself** should be discoverable and operable by operator
  agents without relying on hidden implementation knowledge.

A crucial warning:

> an internal SDK, internal RPC layer, or developer-only client surface does
> **not** automatically count as an operator-facing contract.

A system can be implementation-rich yet operator-poor if its real exposed
surfaces remain weak, hidden, unstable, or incomplete.

---

## Agent-first vs agent-too

### Agent-first

The system is deliberately optimized for agent usability as a primary design
constraint.

### Agent-too

The system may still be human-oriented, but an agent must be able to use it
**at least as well as a competent human**, with access to the **same real
capabilities**, not a toy side channel.

A practical test is:

> Could a careful agent perform the same meaningful work a skilled human
> operator, developer, or analyst can perform, without relying on hidden
> knowledge?

If not, the system is not yet agent-too, and certainly not agent-first.

---

## What this does not mean

It does **not** mean:

- adding a chat box on top of a human-only product,
- exposing only a narrow “AI shortcut” path while the real system remains
  inaccessible,
- forcing the agent to infer behavior from source code instead of supported
  interfaces,
- relying on prose-only output where branching requires structure,
- silently fixing bad input instead of explaining it,
- making the happy path easy while diagnostics remain opaque,
- forcing brittle GUI automation because no real control surface exists.

Agentic engineering is an **architecture and interface discipline**, not a UI
ornament.

---

## The standard

A well-designed agentic system lets the agent answer, from the system itself:

- What can I do?
- What arguments are valid?
- What workflow should I follow?
- What state is the system currently in?
- What exactly failed?
- What should I inspect next?
- What action is safe to take now?
- What rights do I have?
- How do I navigate to the relevant UI state if needed?

---

## Core architectural principles

## 1. Architecture over legacy

Do not preserve bad structure just because it already exists.

If the current design blocks correctness, clarity, maintainability, safe
extension, or autonomous verification, refactor or remove it.

Legacy code is not an argument.
Correct architecture is.

## 2. No silent fallbacks

Do not hide problems through:

- silent defaults,
- implicit downgrades,
- quiet clamping,
- hidden auto-correction,
- “best effort” behavior in correctness-critical paths.

If the system cannot truthfully do something, it must fail explicitly or require
an explicit, user-visible configuration choice.

## 3. Explicit configuration or explicit failure

Behavioral variation must be surfaced at clear entry points.

If multiple behaviors or relaxations exist, they should be controlled through:

- config,
- flags,
- API fields,
- policy settings,
- versioned schemas,
- or similarly explicit interfaces.

Do not bury important behavior switches deep inside the implementation.

## 4. Never fake correctness

An invalid input should remain invalid.
An infeasible state should remain infeasible.
An unsupported case should remain unsupported.

Do not:

- skip constraints to force success,
- fabricate outputs that only look valid,
- emit partial correctness without disclosing it,
- claim stronger guarantees than the implementation actually provides.

## 5. Keep boundaries explicit

Separate concerns deliberately.

Examples:

- domain logic vs infrastructure,
- business model vs transport model,
- validation vs execution,
- orchestration vs interpretation,
- UI vs API,
- control surface vs implementation internals.

Boundaries make systems easier to reason about, test, replace, and extend.

## 6. The UI must not be the only real control surface

A system intended for automation, agents, or serious operability should expose a
first-class **non-UI control surface**.

Usually that means a:

- CLI,
- API,
- RPC interface,
- automation protocol,
- or some combination.

Which surface is primary depends on the product.
The principle is **not** “always CLI-first” or “always API-first.”

The principle is:

> the UI must not be the only reliable way to do real work.

Valid architectures include:

- API-first, with CLI and UI both calling the API,
- shared core, with CLI and API as peer frontends,
- local-tool-first, with an optional service wrapper,
- desktop app plus an explicit automation interface.

Rule of thumb:

- if centralized auth, access control, tenancy, audit, quotas, or shared-policy
  enforcement become core product concerns, an API-authoritative design often
  becomes more attractive,
- if fast local iteration, offline use, deterministic verification, or direct
  agent/developer workflows are central, shared-core or direct local control
  surfaces may remain the better fit.

Choose deliberately. Do not turn one topology into dogma.

## 7. Keep the core generic

Do not let customer-specific, vendor-specific, source-specific, or UI-specific
quirks leak into the core architecture.

Special cases belong at the edges.
The core should remain reusable, composable, and understandable.

## 8. Build a platform, not a one-off

Design interfaces and models so the system can grow without invasive rewrites.

Prefer abstractions that allow new adapters, integrations, policies, workflows,
and execution engines without turning every new feature into a structural rewrite.

## 9. Prefer additive extensibility

New functionality should usually be additive rather than invasive.

Good extension points include:

- interfaces,
- plugins,
- adapters,
- registries,
- explicit protocol contracts,
- modular subpackages.

If extension is painful, improve the architecture instead of piling on special
cases.

## 10. Optimize for deterministic testability

The system should be easy for an agent to verify autonomously.

Prefer:

- deterministic fixtures,
- stable identifiers,
- explicit contracts,
- reproducible execution,
- narrow interfaces,
- fast tests,
- inspectable outputs,
- unit, integration, and contract tests where appropriate.

If behavior is intentionally nondeterministic, that nondeterminism should be
explicitly bounded and documented.

For important architectural invariants, prefer **executable guardrails** over
prose-only rules.

The strongest systems encode those invariants as machine-runnable checks with:

- local entrypoints,
- CI enforcement where appropriate,
- structured output where useful,
- and explicit debt baselines when cleanup must be staged.

Typical high-value checks include:

- docs index or read-order path validation,
- public API or export manifest validation,
- workflow catalog and inspect-surface consistency checks,
- and steering-contract proofs when backend results are meant to reopen exact UI state.

## 11. Treat assumptions as explicit artifacts

If the system proceeds by estimating, inferring, synthesizing, or relaxing
something, that should be surfaced explicitly.

Do not let assumptions remain invisible implementation details.

A good system records assumptions in a structured form and makes them visible to
callers, operators, logs, artifacts, or validation reports.

## 12. Prefer thin, truthful layers

A layer should do its own job and no more.

Examples:

- API layer should expose operations and return truthful responses,
- orchestration should coordinate rather than invent semantics,
- adapters should translate rather than embed hidden policy,
- UI should present system state rather than fabricate it.

Thin layers are easier to test, easier to replace, and harder to lie with.

## 13. Version contracts explicitly

Any contract that crosses boundaries should have an explicit compatibility
strategy.

Examples:

- API payloads,
- file formats,
- plugin protocols,
- worker protocols,
- schemas,
- config versions.

Breaking changes should be deliberate.
Compatibility should not rely on guesswork.

## 14. Prefer single sources of truth

When a concept has one canonical definition, give it one authoritative home.

Examples include:

- schemas,
- workflow catalogs,
- inspect-target registries,
- route and selected-state registries,
- docs topic maps or read-order registries,
- and help text generated from authoritative metadata.

Duplicate truth causes drift.
Drift makes both humans and agents unreliable.

## 15. Keep documentation aligned with reality

Documentation must not claim behavior the system does not actually implement.

Prefer docs that are:

- close to the code,
- derived from real contracts when possible,
- explicit about limits,
- updated together with behavior changes,
- organized through task/topic routing when the system is too large for one flat manual,
- and validated for stale references where practical.

Stale docs are operational defects.

## 16. Structured observability over ad hoc debugging

Prefer structured, machine-usable observability.

Examples:

- structured logs,
- stable event types,
- per-run or per-task artifacts,
- explicit status transitions,
- inspectable intermediate outputs,
- correlation IDs,
- inspect surfaces scoped by entity kind or workflow family,
- workflow summaries that expose blockers, related entities, and likely next actions.

Do not mix machine protocols with human logging streams.
Keep control, output, logging, and telemetry channels conceptually separate.

When the system has many workflows, prefer focused inspection entrypoints over
one giant undifferentiated debug dump.

## 17. Safety and permissions are real architecture concerns

Do not bypass the real permission model just because a caller is an agent or an
internal tool.

If the system has auth, scopes, roles, approvals, impersonation, or audit
trails, those must be part of the architecture, not post-hoc decoration.

## 18. Operational actions must be intentional

Potentially disruptive runtime actions should never be casual side effects.

Examples:

- restarting services,
- deleting persisted data,
- changing shared runtime state,
- running migrations,
- cancelling active work.

Read-only inspection and disruptive operations must be clearly distinguishable.

## 19. Clarity over cleverness

Prefer explicit, obvious, auditable design over compact but magical cleverness.

A little verbosity is often a feature if it improves readability, type safety,
traceability, reviewability, and agent reliability.

## 20. Strong typing and explicit contracts are preferred

Use strong typing, schemas, and explicit data shapes where they improve
correctness and agent reliability.

Avoid relying on:

- ambiguous ad hoc maps,
- undocumented conventions,
- magical strings with hidden meaning,
- positional behavior with implicit semantics.

## 21. Design for honest evolution

Software changes.
Good architecture accepts this by making assumptions visible, contracts
versioned, migrations deliberate, and obsolete paths removable.

The goal is not to avoid change.
The goal is to make change safe and understandable.

---

## Agent-ready system properties

A system is agent-ready when it provides the following properties.

### 1. Self-discoverable interface

The system must expose ways to discover capabilities without outside knowledge.

Examples:

- `help` / `--help`
- schema endpoints
- capability listings
- command/topic indexes
- machine-readable metadata
- embedded examples
- workflow catalogs grouped by workflow family, actor type, or entity kind
- topic-based docs routers or read-order maps
- per-target help such as `inspect --help` and `inspect <target> --help`

Discovery should also be scoped, not just exhaustive.
A strong system lets the agent ask not only “what commands exist?” but also:

- what workflows exist for this actor,
- what can I inspect for this entity type,
- what should I read before changing this area,
- and what command should I try next from this state.

### 2. Agent-readable by default; structured when needed

Advanced agents can understand human language very well.
The goal is not “everything must be JSON.”
The goal is:

- outputs should be clear enough for an intelligent reader with zero prior context,
- and they should provide structured forms wherever precision, branching,
  large-scale processing, or tool composition require it.

Anything an agent may need to branch on reliably should be available in a
structured form.

Examples:

- JSON output where reliable parsing matters,
- stable error envelopes,
- typed fields instead of prose-only output where branching depends on them,
- stable status values,
- explicit IDs for jobs, runs, sessions, and artifacts.

Rich human-readable output is often an excellent agent interface.
But text alone is not always enough for precise automation.

### 3. Guided workflow

The system should actively teach correct usage.

Examples:

- recommended command sequence,
- “read this before doing X” guidance,
- next-step hints after success or failure,
- built-in docs for common pitfalls,
- explicit inspection commands after execution,
- entity-centric “next” resolution for important workflows,
- docs routing that returns the exact relevant topic or path for the current task.

### 4. Explicit state and inspectability

Agents need visibility into current and resulting state.

Examples:

- config inspection,
- status endpoints,
- output inspection,
- domain-state inspection,
- inspect-by-entity commands keyed by stable entity kinds and IDs,
- workflow summaries that expose status, blockers, related entities, recent events, and recommended next actions,
- event streams or progress,
- stable references to relevant UI locations.

If the agent cannot inspect state, it will guess.
Good systems prevent that.

### 5. Strict, honest error behavior

Errors must be explicit, precise, and actionable.

Good errors say:

- what failed,
- where it failed,
- why it failed,
- what values or fields are valid,
- what the agent should inspect next.

Bad behavior includes:

- silent fallbacks,
- hidden defaults,
- vague messages,
- partial success without disclosure,
- best-effort behavior in correctness-critical paths.

### 6. Stable contracts

Agents are reliable when interfaces are predictable.

Prefer:

- stable command shapes,
- stable field names,
- stable error codes,
- explicit versioning,
- explicit compatibility checks,
- deterministic results where practical.

### 7. One-step operations

Each command or API call should do one clearly named thing.

Atomic operations improve:

- reasoning,
- retry safety,
- failure localization,
- auditability.

### 8. Safe operational boundaries

Agents must be able to tell the difference between:

- read vs write,
- check vs execute,
- preview vs commit,
- inspect vs mutate,
- local state vs shared runtime state.

### 9. Embedded conceptual docs

Agent-ready systems include conceptual docs close to the interface.

Not just references, but explanations of:

- the model,
- domain semantics,
- common failure modes,
- correct mental models,
- how not to misuse the tool.

### 10. Consistency across surfaces

If the system has CLI, API, and UI, they should reinforce each other.

Prefer the same:

- nouns,
- IDs,
- status vocabulary,
- field names,
- workflow concepts.

### 11. Access to all important features

The agent should not be locked out of the software's real capabilities.

Not every feature must appear in the exact same form as the UI, but all
important user-visible operations should be reachable through a proper
agent-usable interface.

### 12. Rights, permissions, and auditability

If humans are subject to permissions, approvals, scopes, or audit logs, agents
must be integrated into that same model.

Agent usability without a real rights model is a shortcut, not maturity.

---

## Control, observe, guide, and steer

A useful design model is to think in four surfaces.

### 1. Control surface

How the agent performs actions.

Typical forms:

- CLI commands,
- REST or RPC API,
- job submission endpoints,
- mutation commands,
- import/export flows.

### 2. Observe surface

How the agent sees current state and results.

Typical forms:

- status endpoints,
- logs,
- event streams,
- job progress,
- inspect commands,
- config/state views,
- artifact inspection.

### 3. Guidance surface

How the system teaches the agent correct usage.

Typical forms:

- docs topics,
- schema/capabilities surfaces,
- examples,
- next-step hints,
- workflow suggestions,
- error guidance.

### 4. Steering surface

How the agent relates to the UI when a UI exists.

Useful patterns:

- stable navigation targets,
- deep links,
- routeable views by object ID,
- inspect pages tied to backend entities,
- explicit UI targets for recently changed objects,
- reversible mapping from backend state to visible UI state,
- canonical route/query-state contracts for selecting a specific object, panel, or filter,
- route or navigation registries as single sources of truth,
- stable path/name mappings,
- smoke tests for route wrappers and navigation entrypoints,
- browser or end-to-end proofs that steering contracts still resolve the intended UI state.

The goal is not brittle pixel automation by default.
The goal is to make the UI part of an inspectable, steerable system.

When a UI exists, the steering surface should let the agent drive the interface
into the exact user-relevant state — selected object, section, filter, panel,
and focus context — so it can guide a human reviewer or operator without vague
instructions.

---

## Practical rules for implementation agents

When implementing this philosophy into a repo, prefer the following.

### Commands and APIs

- Expose a `schema`, `help`, `docs`, or `capabilities` entry point.
- Support structured output.
- Return stable IDs for anything long-running or inspectable.
- Separate submission from monitoring for long jobs.
- Offer explicit inspection commands for outputs and intermediate artifacts.
- Provide inspect surfaces scoped by entity type or workflow family, not just one giant generic dump.
- Provide a machine-readable workflow catalog with things like docs paths, control surfaces, observe surfaces, example commands, required permissions, and relevant UI targets where applicable.
- Provide entity-centric or workflow-centric next-step resolution for important states.
- Make unsupported operations fail clearly.
- Make permissions and required scopes visible where practical.

### Errors

- Include field names, paths, valid alternatives, and next-step hints.
- Use stable machine-readable codes where branching matters.
- Reject unsupported versions explicitly.
- Never hide assumptions.
- Distinguish input errors, permission errors, state conflicts, and internal errors.

### Documentation

- Keep docs close to commands.
- Provide topic docs for common mistakes.
- Include examples agents can copy exactly.
- Document required workflow order.
- Provide read-order maps or topic routers for large systems so the agent can resolve what to read next.
- Keep docs references machine-checkable where practical.
- Document operational safety rules.
- Document the rights model at the level needed for correct use.

### Data contracts

- Prefer schemas over ad hoc conventions.
- Version contracts explicitly.
- Keep naming consistent across tools.
- Make defaults visible.
- Treat workflow catalogs, inspect-target registries, UI target descriptors, and readiness/proof metadata as real contracts when the system depends on them.
- Keep schema and implementation in sync.

### Runtime behavior

- Be deterministic where possible.
- Make progress observable.
- Preserve inspectable artifacts.
- Validate discovery, inspect, docs, and steering contracts with executable checks where practical.
- Do not mix progress logs into machine-readable output channels.
- Keep human logs and machine output separable.

### UI integration

- Prefer deep links and stable targets over brittle UI automation.
- Make backend entities resolvable to UI locations.
- Prefer canonical selected-state routes and query conventions over vague “open the right screen somehow” behavior.
- Make changes inspectable in the UI by ID, not just by “latest.”
- Let the CLI or API point the user to relevant UI views for debugging.
- Test steering contracts end to end when the UI is part of an operational workflow.

---

## Retrofit sequence for an existing project

If you want to retrofit an existing repo toward this standard, the rough order is:

1. inventory the real feature surface,
2. identify which important features remain inaccessible to agents,
3. create or improve a control surface,
4. add an inspection surface,
5. add discovery and guidance,
6. make the UI steerable if a UI exists,
7. integrate with the real auth/rights/audit model,
8. make debugging first-class,
9. eliminate drift between docs, schema, code, and UI.

Do not cargo-cult exact mechanisms from another project.
Adapt the pattern to the software's nature.

---

## Anti-patterns

These are strong signs a system is not agent-ready:

- the only reliable workflow is “open the UI and figure it out,”
- correct usage depends on undocumented conventions,
- errors require reading source code to understand,
- structured output is polluted by human logs,
- important state exists but is not inspectable,
- schema/help/docs disagree with implementation,
- long-running actions have no job ID, progress, or artifact inspection,
- the agent must infer “latest” instead of using explicit IDs,
- correctness-critical paths silently substitute defaults,
- the UI has real features that the agent cannot reach,
- the agent bypasses the real permission model through a hidden shortcut.

---

## Simple test

Ask this question:

> Could a careful, stateless operator agent with no tribal knowledge and no
> repository access succeed by using only the exposed interface, clear built-in
> docs, appropriately structured outputs where needed, and the normal
> permission model?

If the answer is not clearly yes, the system is not yet agent-first or
agent-too.

A stronger version is:

> Could the agent use the important features at least as well as a competent
> human, including debugging and inspection?

If not, the implementation is still incomplete.

---

## Final sentence

**A strong agentic repository is one where behavior is explicit, failures are honest, contracts are stable, boundaries are clear, important capabilities are reachable without the UI, and both humans and agents can verify the system more easily than they can guess about it.**
