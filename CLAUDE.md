@~/ralph-repos/vibe-setup/AGENTS.md

# GroupMixer

A group assignment optimization tool that distributes people into groups across multiple sessions while maximizing social interactions and respecting constraints.

## Codebase Overview

GroupMixer uses simulated annealing to solve the Social Group Scheduling Problem - assigning people to groups across sessions for networking events, team building, conferences, and classroom rotations.

**Stack**: Rust (solver-core, solver-wasm, solver-server), React/TypeScript (webapp), WebAssembly

**Structure**:
- `solver-core/` - Core optimization library with simulated annealing
- `solver-wasm/` - WASM bindings for browser use
- `solver-server/` - Optional REST API (Axum)
- `webapp/` - React frontend with Zustand, Three.js visualizations
- `legacy_*/` - Historical C++/Rust implementations for comparison

For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Key Concepts

### Constraints
- **Hard**: ImmovablePerson, MustStayTogether (cliques), group capacity
- **Soft**: RepeatEncounter, AttributeBalance, ShouldStayTogether, ShouldNotBeTogether, PairMeetingCount

### Algorithm
Simulated annealing with three move types: clique swaps, person transfers, regular swaps. Geometric cooling with optional reheating.

## Common Tasks

### Build WASM
```bash
cd solver-wasm
wasm-pack build --target web
cp pkg/* ../webapp/public/
```

### Run webapp locally
```bash
cd webapp
npm install
npm run dev
```

### Run Rust tests
```bash
cargo test -p solver-core
```

### Run server
```bash
cargo run -p solver-server
```

## Important Files

| File | Purpose |
|------|---------|
| `solver-core/src/solver.rs` | State management, constraint processing (largest file) |
| `solver-core/src/models.rs` | All API types and constraints |
| `webapp/src/store/index.ts` | Zustand store with 70+ actions |
| `webapp/src/services/wasm.ts` | WASM integration with format conversion |
| `webapp/src/components/ProblemEditor.tsx` | Main problem definition UI |
