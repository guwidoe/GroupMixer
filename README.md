<p align="center">
  <img src="logo.svg" alt="GroupMixer Logo" width="120"/>
</p>

# GroupMixer

A sophisticated Rust-based solution for optimally distributing people into groups across multiple sessions to maximize social interactions while respecting various constraints. Now featuring **GroupMixer**, a modern web application that makes group optimization accessible to everyone.

## 🌟 Try GroupMixer

**GroupMixer** is a user-friendly web application built on top of the GroupMixer engine. Perfect for conferences, workshops, team building, and any event where you need to create optimal group assignments.

🚀 **[Try GroupMixer Now](https://groupmixer.app)** - No installation required, runs entirely in your browser!

## Overview

GroupMixer solves the social group scheduling problem using advanced optimization algorithms. It distributes a given number of people into groups across multiple sessions, maximizing the number of unique contacts while respecting various hard and soft constraints.

## Architecture

The project is organized as a Rust workspace plus a web application with six main components:

### 🧠 `gm-core` - Core Optimization Engine

The heart of the system, providing:

- **Simulated Annealing** algorithm for optimization
- **Flexible constraint system** supporting:
  - Repeat encounter limits (with configurable penalty functions)
  - Attribute balance constraints (e.g., gender distribution)
  - Immovable person assignments
  - Must-stay-together constraints
  - Cannot-be-together constraints
- **Comprehensive scoring system** with detailed breakdowns
- **Configurable stop conditions** (time limits, iteration limits, improvement thresholds)
- **Extensive test suite** with data-driven tests

### 🌐 `webapp` - GroupMixer Web Application

A modern, full-featured React application that provides:

- **Intuitive web interface** for scenario setup and visualization
- **React 19 + TypeScript** with Vite for fast development
- **Tailwind CSS** for beautiful, responsive design
- **WebAssembly integration** for client-side optimization
- **No data transmission** - everything runs locally in your browser
- **Scenario management** with save/load functionality
- **Real-time solving** with progress visualization
- **Results export** to CSV and JSON formats
- **Demo cases** with pre-configured examples
- **Browser agent API** via `window.GroupMixerAgent` for agent/operator integrations
- **Vercel deployment** for production hosting

Key features:

- Landing page with feature overview and use cases
- Interactive scenario editor for people, groups, and constraints
- Advanced solver configuration panel
- Results visualization with detailed score breakdowns
- History tracking and result comparison
- Dark/light theme support

### 🌐 `gm-api` - Web API Server

A high-performance HTTP server built with Axum that provides:

- **Contract-native HTTP API** for solve/validate/recommend/evaluate flows
- **Local discovery/help endpoints** derived from `gm-contracts`
- **JSON-based request/response payloads** for easy integration
- **Canonical public error envelopes** shared with other surfaces

### 📜 `gm-contracts` - Shared Contract Registry

The transport-neutral semantic registry that defines:

- **Operation IDs and help metadata**
- **Shared schemas and examples**
- **Canonical public errors**
- **Generated reference documentation**

### 🖥️ `gm-cli` - Command-Line Interface

A CLI projection of the same shared contract surface for:

- **Local solver execution**
- **Schema/help/error inspection**
- **Operator-friendly scripting and automation**

### ⚡ `gm-wasm` - WebAssembly Module

WebAssembly compilation of the core solver for:

- **Client-side optimization** in web browsers
- **Offline processing capabilities**
- **Integration with the webapp frontend**
- **Contract-native browser discovery and execution APIs**

## Key Features

### Advanced Optimization

- **Simulated Annealing** with configurable temperature schedules
- **Multiple objective functions** for different problem sizes
- **Penalty-based constraint handling** with adjustable weights
- **Detailed score breakdown** for debugging and analysis

### Flexible Constraints

- **Repeat encounter limits** with squared or linear penalty functions
- **Attribute balance** (e.g., gender distribution per group)
- **Immovable assignments** (fixed person-group-session assignments)
- **Grouping constraints** (must-stay-together, cannot-be-together)
- **Configurable penalty weights** for fine-tuning

### User-Friendly Web Interface

- **No installation required** - runs entirely in your browser
- **Modern, responsive design** built with React and Tailwind CSS
- **Real-time optimization** with progress tracking
- **Interactive scenario setup** with validation and error handling
- **Results visualization** with exportable schedules
- **Scenario templates** and demo cases for quick start

### Production Ready

- **Comprehensive test suite** with 20+ test cases
- **Benchmark scenarios** for performance validation
- **Error handling** with detailed error messages
- **Documentation** and examples
- **Deployed web application** ready for production use

## Quick Start

### 🎯 Using GroupMixer (Recommended)

The easiest way to get started is with the web application:

1. **Visit the deployed app** at [GroupMixer](https://groupmixer.app)
2. **Try a demo case** from the dropdown to see the tool in action
3. **Create your own scenario** by defining people, groups, and constraints
4. **Run the solver** and view optimized results
5. **Export schedules** in CSV or JSON format

### 💻 Running Locally

To run the webapp locally:

```bash
# Clone the repository
git clone https://github.com/yourusername/GroupMixer.git
cd GroupMixer

# Install deps, generate WASM, and run the webapp
cd webapp
npm ci
npm run build-wasm
npm run dev
```

The webapp will be available at `http://localhost:5173`

### 🤖 Browser Agent API

The webapp exposes a browser-side agent/operator surface for local integrations.

- global: `window.GroupMixerAgent`
- ready event: `groupmixer:agent-ready`
- preferred transport: `worker`
- available transports: `worker`, `wasm`
- bootstrap entrypoint: `capabilities()`

Example:

```js
window.addEventListener('groupmixer:agent-ready', async () => {
  const api = window.GroupMixerAgent;
  const capabilities = await api.worker.capabilities();
  console.log(capabilities.top_level_operations);
});
```

Implementation lives in `webapp/src/services/browserAgentApi.ts`.

### 🔧 Using the Web Server

1. **Start the server:**

   ```bash
   cd backend/api
   cargo run
   ```

2. **Call the contract-native solve endpoint via HTTP POST to `http://localhost:3000/api/v1/solve`:**
   ```json
   {
     "scenario": {
       "people": [
         { "id": "Alice", "attributes": { "gender": "female" } },
         { "id": "Bob", "attributes": { "gender": "male" } }
       ],
       "groups": [{ "id": "Group1", "size": 2 }],
       "num_sessions": 3
     },
     "constraints": [
       {
         "type": "RepeatEncounter",
         "max_allowed_encounters": 1,
         "penalty_function": "squared",
         "penalty_weight": 100.0
       }
     ],
     "solver": {
       "solver_type": "SimulatedAnnealing",
       "stop_conditions": {
         "max_iterations": 10000,
         "time_limit_seconds": 30
       },
       "solver_params": {
         "SimulatedAnnealing": {
           "initial_temperature": 100.0,
           "final_temperature": 0.1,
           "cooling_schedule": "geometric"
         }
       }
     }
   }
   ```

3. **Use `POST /api/v1/validate-scenario` to validate the same request body without running optimization, or `GET /api/v1/help` to discover the rest of the public contract surface.**

### 📚 Using the Core Library

```rust
use gm_core::{run_solver, models::ApiInput};

let input = ApiInput {
    // ... configuration
};

match run_solver(&input) {
    Ok(result) => {
        println!("Final score: {}", result.final_score);
        println!("Schedule:\n{}", result.display());
    }
    Err(e) => eprintln!("Error: {:?}", e),
}
```

## Use Cases

GroupMixer is perfect for:

### 📚 Conferences & Workshops

- Breakout sessions with rotating groups
- Networking mixers and speed networking
- Workshop rotations with skill-based grouping
- Panel discussions with diverse representation

### 🏢 Team Building & Training

- Cross-departmental collaboration sessions
- Training groups with balanced skill levels
- Mentorship program pairings
- Leadership development cohorts

### 🎓 Educational Settings

- Student project groups with diverse skills
- Study groups across different majors
- Peer review assignments
- Discussion circles with varied perspectives

### 🎉 Social Events

- Dinner party table arrangements
- Game tournament brackets
- Dating events and mixers
- Community building activities

## Development

### Building the Webapp

```bash
cd webapp
npm run build
```

This builds both the WebAssembly module and the React application.

You can also rebuild just the wasm by using

```bash
cd webapp
npm run build-wasm
```

### Building Individual Components

```bash
# Core solver library
cd backend/core
cargo build --release

# WebAssembly module
cd backend/wasm
wasm-pack build --target web --out-dir ../webapp/public/pkg

# HTTP server
cd backend/api
cargo run
```

## Testing

The authoritative repo-wide testing policy lives in [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md).
For practical "what should I run before I commit this refactor?" guidance, see [`docs/TEST_PYRAMID_AND_REFACTOR_WORKFLOW.md`](docs/TEST_PYRAMID_AND_REFACTOR_WORKFLOW.md).

Current baseline commands:

```bash
# Run the fast Rust gate
./scripts/test-rust-fast.sh

# Generate the Rust coverage artifacts + summary gate
./scripts/coverage-rust.sh

# Run frontend unit/component coverage with CI thresholds
cd webapp && npm run test:coverage:ci

# Run browser workflow tests
cd webapp && npm run test:e2e:workflows
```

Coverage outputs are published in standard formats for review:
- Rust: `target/coverage/rust-summary.txt`, `target/coverage/rust.lcov`, `target/coverage/rust-html/`
- Frontend: `webapp/coverage/unit/`

Test cases cover:

- Basic functionality
- Constraint handling
- Performance benchmarks
- Edge cases and stress tests
- Comparison with Google CP-SAT solver

## Deployment

The webapp is configured for easy deployment on Vercel:

```bash
cd webapp
npm run vercel-build
```

The build process automatically:

1. Installs Rust toolchain
2. Builds the WebAssembly module
3. Compiles TypeScript
4. Creates optimized production bundle

## Legacy Components

The project also includes:

- **Legacy C++ implementation** (`legacy_cpp/`)
- **Legacy Rust implementation** (`legacy_rust/`)
- **Python Google CP-SAT solver** (`python/`) for comparison

## Performance

The Rust implementation provides significant performance improvements over the original C++ version, with:

- **Faster execution** through optimized algorithms
- **Better memory management** with Rust's ownership system
- **Client-side processing** with WebAssembly
- **Scalable architecture** for large problem sizes

## Contributing

The project welcomes contributions! Areas for improvement include:

- Additional optimization algorithms (Hill Climbing, Genetic Algorithms)
- More constraint types
- Performance optimizations
- UI/UX improvements for the webapp
- Additional export formats
- Mobile app development

## License

See [LICENSE.md](LICENSE.md) for details.
