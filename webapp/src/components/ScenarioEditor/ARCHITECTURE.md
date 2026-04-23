# Scenario Setup architecture

This note defines the **target information architecture** for the Scenario Setup flow and the component boundaries we want to preserve during the refactor.

## Goals

- reflect the real dependency structure of a scenario definition
- reduce nested horizontal tab bars
- support a desktop sidebar and a mobile drawer from the same nav model
- keep the editor modular: no giant all-in-one shell component

## Target information architecture

### App level

Keep the existing top-level app navigation horizontal:

- Scenario Setup
- Solver
- Results
- Result Details
- Manual Editor

### Scenario Setup level

Scenario Setup should become a grouped sidebar/drawer with these canonical groups and order:

#### Model
1. Sessions
2. Groups
3. Attribute Definitions
4. People

#### Rules
5. Hard Constraints
6. Soft Constraints

#### Goals
7. Objectives

## Rationale

This ordering matches the intended dependency flow more closely than the current flat tab row:

- sessions define the highest-level structure
- groups are currently global, but are expected to become more session-aware later
- attribute definitions shape the schema people can use
- people depend on attributes and session availability
- constraints depend on the model
- objectives are optimization goals, not core model structure

## Routing model

Use a single route segment for the active Scenario Setup section:

- `/app/scenario/:section`

Desktop sidebar and mobile drawer must both be driven by the same section registry. They should not define separate hard-coded menus.

## Phase boundaries

### Phase 1–2 scope

- document the target IA
- extract a shared Scenario Setup navigation schema/registry
- allow the legacy flat tab bar to read from that schema during the transition

### Explicit non-goals for Phase 1–2

- shipping the sidebar/drawer shell yet
- merging sections into large composite files
- fully reworking hard/soft constraint family navigation yet
- changing every existing section implementation at once

## Component boundaries

### Navigation/model layer

Owns section metadata only:

- ids
- labels
- descriptions
- icons
- grouping
- ordering
- count badge selectors
- rollout status / visibility per surface

Suggested files:

- `navigation/scenarioSetupNavTypes.ts`
- `navigation/scenarioSetupNav.ts`

### Layout layer

Owns desktop/mobile navigation chrome only:

- sidebar
- sidebar groups/items
- mobile drawer/hamburger trigger
- content frame

Suggested files:

- `layout/ScenarioSetupLayout.tsx`
- `../../workspace/layout/WorkspaceLayout.tsx`
- `../../workspace/layout/WorkspaceSidebar.tsx`
- `../../workspace/layout/WorkspaceMobileNav.tsx`

### Controller/orchestration layer

Owns store access, hooks, and section-level wiring:

- scenario editor controller hook
- active section resolution
- modal/form composition
- section renderer/registry

Suggested files:

- `ScenarioEditor.tsx`
- `useScenarioEditorController.ts`
- `ScenarioSetupSectionRenderer.tsx`

### Section layer

Owns individual section UIs only:

- sessions
- groups
- attribute definitions
- people
- hard constraints
- soft constraints
- objectives

Each section should stay small and focused. Avoid creating a single giant section switch file.

### Constraint local navigation

Hard and soft constraints may keep their own local family selector in the first pass, but that selector should be isolated into dedicated components rather than mixed into large section files.

## Attribute Definitions decision

Attribute Definitions are a **first-class setup concept** in the target IA.

During the transition, existing attribute UI can be reused, but the long-term navigation model should treat attributes as their own section rather than as an implementation detail nested under People.

## Scenario document boundary

Scenario Setup edits a **frontend document aggregate**, not just the solver DTO.

- `Scenario` = solver-facing payload that matches `gm-core`
- `ScenarioDocument` = editor-facing aggregate:
  - `scenario`
  - `attributeDefinitions`

This distinction is normative for the refactor:

- the editor/store should treat `ScenarioDocument` as the primary workspace document
- reconciliation and normalization should happen at the document boundary
- solver/runtime flows should consume the derived solver payload from that document
- attribute definitions are first-class document data, not incidental side state

This keeps the GUI truthful to the real editing model and gives undo/redo a clean architectural unit.
