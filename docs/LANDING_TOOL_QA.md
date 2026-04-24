# Landing tool + advanced workspace QA checklist

This checklist validates the tool-first landing flow introduced for `TODO-b55201e3`.

## Automated coverage in place

Current automated checks touch these risk areas:

- route-level landing shell rendering and redirects
- route-level metadata / canonical wiring
- quick-setup draft parsing and `Problem` mapping
- shared solve service behavior
- landing -> `/app` workspace bridge
- shared landing/app results view model
- advanced solver runner behavior after shared-solver extraction

Key commands:

```bash
cd webapp && npm run test:unit -- src/App.test.tsx src/pages/ToolLandingPage.test.tsx
cd webapp && npm run test:unit -- src/utils/quickSetup/buildProblemFromDraft.test.ts
cd webapp && npm run test:unit -- src/services/solver/solveProblem.test.ts src/components/SolverPanel/utils/runSolver.test.ts
cd webapp && npm run test:unit -- src/store/index.test.ts src/components/results/buildResultsViewModel.test.ts
cd webapp && npx tsc --noEmit
```

## Manual success-path checklist

### 1. Tool-first landing route
- open `/`
- confirm the quick-setup tool is visible above the fold
- confirm the hero copy explains the product in simple user language
- confirm the tool works before touching `/app`

### 2. Basic quick-setup generation
- paste newline-separated names
- choose `number of groups`
- click `Generate groups`
- confirm inline results appear
- click `Reshuffle`
- confirm results update

### 3. Advanced options path
- open advanced options
- set `sessions > 1`
- enable `Avoid repeat pairings`
- add a `Keep together` pair
- add an `Avoid pairing` pair
- click `Generate groups`
- confirm generation still succeeds

### 4. CSV + balancing path
- switch to CSV mode
- paste a small csv with a `name` column and at least one attribute column
- confirm the balancing selector appears
- choose an attribute
- generate results
- export the draft file and inspect that it contains a backend-aligned `problem`

### 5. Landing -> advanced workspace bridge
- generate on landing
- click `Open in advanced workspace`
- confirm navigation reaches `/app/results`
- confirm the result renders immediately
- confirm `currentProblemId` remains null-backed scratchpad state until explicitly saved in `/app`

### 6. Scratchpad safety
- load an existing saved problem inside `/app`
- return to `/`
- experiment with a new quick setup
- confirm the existing saved problem is unchanged until the explicit bridge action is invoked
- after bridging, confirm `/app` shows the scratchpad banner

### 7. Public SEO routes
Validate the public SEO routes:

- `/`
- `/de`
- `/es`
- `/fr`
- `/ja`
- `/hi`
- `/zh`
- `/guides/...`

For each, confirm:
- H1 and copy render correctly
- title/description/canonical update appropriately
- FAQ or guide content appears where expected
- structured data is present only where expected

## Edge cases to test manually

- duplicate participant names
- blank lines in the name list
- CSV with no explicit `name` header
- group count larger than participant count
- invalid numeric inputs like `0` or negative values
- keep-together / avoid-pairing names that do not exist in the participant list
- solve-service failure fallback path still shows a local grouping result

## Lightweight instrumentation hooks

The landing flow currently emits lightweight client-side events via `trackLandingEvent(...)` for:

- `landing_route_viewed`
- `landing_generate_clicked`
- `landing_advanced_toggled`
- `landing_open_advanced_workspace`
- `landing_save_project_clicked`

These events are intentionally lightweight and suitable for later analytics hookup.
