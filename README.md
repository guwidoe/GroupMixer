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

The project is organized as a Rust workspace with four main components:

### 🧠 `solver-core` - Core Optimization Engine

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

- **Intuitive web interface** for problem setup and visualization
- **React 19 + TypeScript** with Vite for fast development
- **Tailwind CSS** for beautiful, responsive design
- **WebAssembly integration** for client-side optimization
- **No data transmission** - everything runs locally in your browser
- **Problem management** with save/load functionality
- **Real-time solving** with progress visualization
- **Results export** to CSV and JSON formats
- **Demo cases** with pre-configured examples
- **Vercel deployment** for production hosting

Key features:

- Landing page with feature overview and use cases
- Interactive problem editor for people, groups, and constraints
- Advanced solver configuration panel
- Results visualization with detailed score breakdowns
- History tracking and result comparison
- Dark/light theme support

### 🌐 `solver-server` - Web API Server

A high-performance HTTP server built with Axum that provides:

- **RESTful API** for submitting optimization jobs
- **Asynchronous job processing** with background task management
- **Real-time job status tracking**
- **JSON-based input/output** for easy integration

### ⚡ `solver-wasm` - WebAssembly Module

WebAssembly compilation of the core solver for:

- **Client-side optimization** in web browsers
- **Offline processing capabilities**
- **Integration with the webapp frontend**
- **Cross-platform deployment**

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
- **Interactive problem setup** with validation and error handling
- **Results visualization** with exportable schedules
- **Problem templates** and demo cases for quick start

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
3. **Create your own problem** by defining people, groups, and constraints
4. **Run the solver** and view optimized results
5. **Export schedules** in CSV or JSON format

### 💻 Running Locally

To run the webapp locally:

```bash
# Clone the repository
git clone https://github.com/yourusername/GroupMixer.git
cd GroupMixer

# Build and run the webapp
cd webapp
npm install
npm run dev
```

The webapp will be available at `http://localhost:5173`

### 🔧 Using the Web Server

1. **Start the server:**

   ```bash
   cd solver-server
   cargo run
   ```

2. **Submit a job via HTTP POST to `http://localhost:3000/solve`:**
   ```json
   {
     "problem": {
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

### 📚 Using the Core Library

```rust
use solver_core::{run_solver, models::ApiInput};

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
cd solver-core
cargo build --release

# WebAssembly module
cd solver-wasm
wasm-pack build --target no-modules

# HTTP server
cd solver-server
cargo run
```

## Testing

The project includes extensive testing:

```bash
# Run all tests
cargo test

# Run specific test categories
cargo test --test data_driven_tests

# Run benchmarks
cargo test --test data_driven_tests -- --ignored
```

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
