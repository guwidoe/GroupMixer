# Solver-Core: Advanced Group Distribution Optimization Engine

The `solver-core` is a high-performance Rust library that implements sophisticated optimization algorithms for solving the social group scheduling problem. It distributes people into groups across multiple sessions while maximizing social interactions and respecting complex constraints.

## 🎯 Purpose & Problem Domain

The solver-core addresses the **Social Group Scheduling Problem**: given a set of people, groups with specific capacities, and multiple sessions, optimally assign people to groups to:

- **Maximize unique social contacts** between participants
- **Minimize repeat encounters** to promote diversity
- **Respect hard constraints** like group size limits and mandatory assignments
- **Balance soft constraints** like attribute distribution and social preferences
- **Handle complex scenarios** like late arrivals, early departures, and session-specific rules

## 🏗️ Architecture Overview

### Core Components

```
solver-core/
├── src/
│   ├── lib.rs              # Public API and main entry point
│   ├── models.rs           # Data structures and API types
│   ├── solver.rs           # Core state management and optimization logic
│   └── algorithms/         # Optimization algorithm implementations
│       ├── mod.rs
│       └── simulated_annealing.rs
├── examples/               # Usage examples and demos
├── tests/                  # Comprehensive test suite
└── Cargo.toml             # Dependencies and configuration
```

### Key Design Principles

1. **Performance-First**: Integer-based internal representation with string-to-index mappings for fast operations
2. **Constraint Flexibility**: Extensible constraint system supporting hard and soft constraints
3. **Algorithm Modularity**: Pluggable optimization algorithms with consistent interfaces
4. **Rich Scoring**: Detailed score breakdowns for debugging and analysis
5. **Production Ready**: Comprehensive error handling, logging, and validation

## 🚀 Features

### Advanced Optimization Algorithms

#### Simulated Annealing

- **Temperature-based exploration**: Starts with high randomness, gradually focusing on local improvements
- **Configurable cooling schedules**: Geometric and linear temperature reduction
- **Dual move types**: Regular person swaps and intelligent clique swaps
- **Adaptive probability**: Dynamic selection between move types based on constraint density

```rust
// Cooling schedule: T(i) = T_initial * (T_final/T_initial)^(i/max_iterations)
let temperature = self.initial_temperature
    * (self.final_temperature / self.initial_temperature)
        .powf(i as f64 / self.max_iterations as f64);
```

### Comprehensive Constraint System

#### Hard Constraints

- **Group Capacity**: Strict enforcement of group size limits
- **Immovable People**: Fixed person-group-session assignments
- **Participation Windows**: People can join/leave at specific sessions

#### Soft Constraints (Penalty-Based)

- **Repeat Encounter Limits**: Configurable penalties (linear/squared) for repeated pairings
- **Attribute Balance**: Maintain desired distributions (e.g., gender balance) within groups
- **Must-Stay-Together**: Keep specified people in the same group
- **Should-Not-Be-Together**: Prevent certain people from being grouped
- **Session-Specific Rules**: Apply constraints only to specific sessions

### Intelligent State Management

#### Dual Representation System

```rust
// External API uses human-readable strings
pub struct Person {
    pub id: String,
    pub attributes: HashMap<String, String>,
}

// Internal solver uses integer indices for performance
pub struct State {
    pub person_id_to_idx: HashMap<String, usize>,
    pub schedule: Vec<Vec<Vec<usize>>>, // [session][group][people]
    pub locations: Vec<Vec<(usize, usize)>>, // [session][person] -> (group, position)
}
```

#### Smart Constraint Preprocessing

- **Clique Detection**: Merges overlapping "must-stay-together" constraints using Union-Find
- **Conflict Validation**: Prevents contradictory constraints (e.g., must-stay + should-not-be together)
- **Session Filtering**: Efficiently handles session-specific constraint applications

### Advanced Scoring System

#### Multi-Objective Optimization

```rust
fn calculate_cost(&self) -> f64 {
    // Negative because we maximize contacts but minimize cost
    -self.w_contacts * (self.unique_contacts as f64)
        + self.w_repetition * (self.repetition_penalty as f64)
        + self.attribute_balance_penalty
        + self.calculate_total_constraint_penalty()
}
```

#### Detailed Score Breakdown

- **Unique Contacts**: Number of distinct person-pair interactions
- **Repetition Penalty**: Penalty for exceeding encounter limits
- **Attribute Balance Penalty**: Deviation from desired attribute distributions
- **Constraint Violations**: Weighted penalties for each constraint type

## 📚 API Usage

### Basic Usage

```rust
use solver_core::{run_solver, models::*};
use std::collections::HashMap;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input = ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "Alice".to_string(),
                    attributes: {
                        let mut attrs = HashMap::new();
                        attrs.insert("gender".to_string(), "female".to_string());
                        attrs.insert("department".to_string(), "engineering".to_string());
                        attrs
                    },
                    sessions: None, // Participates in all sessions
                },
                Person {
                    id: "Bob".to_string(),
                    attributes: {
                        let mut attrs = HashMap::new();
                        attrs.insert("gender".to_string(), "male".to_string());
                        attrs.insert("department".to_string(), "marketing".to_string());
                        attrs
                    },
                    sessions: Some(vec![0, 1]), // Only sessions 0 and 1
                },
                // ... more people
            ],
            groups: vec![
                Group { id: "Team1".to_string(), size: 4 },
                Group { id: "Team2".to_string(), size: 4 },
                Group { id: "Team3".to_string(), size: 3 },
            ],
            num_sessions: 3,
        },
        objectives: vec![
            Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }
        ],
        constraints: vec![
            // Limit repeat encounters
            Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".to_string(),
                penalty_weight: 100.0,
            }),
            // Maintain gender balance
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "Team1".to_string(),
                attribute_key: "gender".to_string(),
                desired_values: {
                    let mut values = HashMap::new();
                    values.insert("male".to_string(), 2);
                    values.insert("female".to_string(), 2);
                    values
                },
                penalty_weight: 50.0,
            }),
            // Keep certain people together
            Constraint::MustStayTogether {
                people: vec!["Alice".to_string(), "Bob".to_string()],
                penalty_weight: 1000.0,
                sessions: Some(vec![0, 1]), // Only for sessions 0 and 1
            },
        ],
        solver: SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(50_000),
                time_limit_seconds: Some(30),
                no_improvement_iterations: Some(5_000),
            },
            solver_params: SolverParams::SimulatedAnnealing(
                SimulatedAnnealingParams {
                    initial_temperature: 100.0,
                    final_temperature: 0.1,
                    cooling_schedule: "geometric".to_string(),
                }
            ),
            logging: LoggingOptions {
                log_frequency: Some(1000),
                log_final_score_breakdown: true,
                display_final_schedule: true,
                ..Default::default()
            },
        },
    };

    match run_solver(&input) {
        Ok(result) => {
            println!("Optimization completed!");
            println!("Final score: {}", result.final_score);
            println!("Unique contacts: {}", result.unique_contacts);
            println!("Repetition penalty: {}", result.repetition_penalty);
            println!("\nSchedule:");
            println!("{}", result.display());
        }
        Err(e) => {
            eprintln!("Optimization failed: {:?}", e);
        }
    }

    Ok(())
}
```

### Advanced Configuration

#### Custom Stop Conditions

```rust
StopConditions {
    max_iterations: Some(100_000),      // Maximum iterations
    time_limit_seconds: Some(60),       // Stop after 60 seconds
    no_improvement_iterations: Some(10_000), // Stop if no improvement for 10k iterations
}
```

#### Flexible Constraint Weights

```rust
// Heavy penalty for violations (hard constraint behavior)
Constraint::MustStayTogether {
    people: vec!["Alice".to_string(), "Bob".to_string()],
    penalty_weight: 10000.0, // Very high weight
    sessions: None,
}

// Light penalty for preferences (soft constraint behavior)
Constraint::ShouldNotBeTogether {
    people: vec!["Charlie".to_string(), "Diana".to_string()],
    penalty_weight: 10.0, // Low weight - prefer to avoid but not critical
    sessions: Some(vec![2]), // Only applies to session 2
}
```

## 🔄 Optimization Process

### Algorithm Flow

```
1. Initialize State
   ├── Parse and validate input
   ├── Create integer mappings
   ├── Preprocess constraints
   └── Generate initial random solution

2. Simulated Annealing Loop
   ├── Calculate current temperature
   ├── Choose move type (regular swap vs clique swap)
   ├── Generate candidate move
   ├── Evaluate cost delta
   ├── Accept/reject based on temperature
   └── Update best solution if improved

3. Termination
   ├── Check stop conditions
   ├── Return best solution found
   └── Generate detailed results
```

### Move Types

#### Regular Person Swap

- Swaps two individual people between groups in a single session
- Fast evaluation using delta cost calculation
- Suitable for fine-tuning and local optimization

#### Clique Swap

- Swaps an entire clique (group of people who must stay together) with individual people
- Maintains constraint integrity automatically
- Probability of selection increases with constraint density

### Delta Cost Evaluation

Instead of recalculating the entire cost for each move, the solver uses efficient delta calculations:

```rust
pub fn calculate_swap_cost_delta(&self, day: usize, p1_idx: usize, p2_idx: usize) -> f64 {
    let mut delta = 0.0;

    // Contact delta: changes in unique pairings
    delta += self.calculate_contact_delta(day, p1_idx, p2_idx);

    // Repetition penalty delta: changes in repeat encounter penalties
    delta += self.calculate_repetition_delta(day, p1_idx, p2_idx);

    // Attribute balance delta: changes in group attribute distributions
    delta += self.calculate_attribute_balance_delta(day, p1_idx, p2_idx);

    // Constraint penalty delta: changes in constraint violations
    delta += self.calculate_constraint_penalty_delta(day, p1_idx, p2_idx);

    delta
}
```

## 🔧 Configuration Options

### Solver Parameters

#### Simulated Annealing Configuration

```json
{
  "solver_params": {
    "SimulatedAnnealing": {
      "initial_temperature": 100.0, // Starting temperature
      "final_temperature": 0.1, // Ending temperature
      "cooling_schedule": "geometric" // "geometric" or "linear"
    }
  }
}
```

#### Stop Conditions

```json
{
  "stop_conditions": {
    "max_iterations": 50000, // Maximum iterations
    "time_limit_seconds": 30, // Time limit in seconds
    "no_improvement_iterations": 5000 // Early stopping condition
  }
}
```

#### Logging Options

```json
{
  "logging": {
    "log_frequency": 1000, // Log every N iterations
    "log_initial_state": true, // Log starting configuration
    "log_duration_and_score": true, // Log final timing and score
    "display_final_schedule": true, // Show final group assignments
    "log_initial_score_breakdown": true, // Detailed initial scoring
    "log_final_score_breakdown": true, // Detailed final scoring
    "log_stop_condition": true // Log why optimization stopped
  }
}
```

### Constraint Configuration

#### Repeat Encounter Control

```json
{
  "type": "RepeatEncounter",
  "max_allowed_encounters": 1,
  "penalty_function": "squared", // "linear" or "squared"
  "penalty_weight": 100.0
}
```

#### Attribute Balance

```json
{
  "type": "AttributeBalance",
  "group_id": "Team1",
  "attribute_key": "gender",
  "desired_values": {
    "male": 2,
    "female": 2
  },
  "penalty_weight": 50.0
}
```

#### Session-Specific Constraints

```json
{
  "type": "MustStayTogether",
  "people": ["Alice", "Bob"],
  "penalty_weight": 1000.0,
  "sessions": [0, 1] // Only applies to sessions 0 and 1
}
```

## 🧪 Testing Framework

### Test Categories

#### Unit Tests (`src/solver.rs`)

- State initialization and validation
- Score calculation accuracy
- Move generation and application
- Constraint preprocessing logic

#### Integration Tests (`examples/`)

- End-to-end solver execution
- Complex constraint combinations
- Session-specific constraint handling
- Late arrival/early departure scenarios

#### Data-Driven Tests (`tests/data_driven_tests.rs`)

- 20+ comprehensive test cases covering various scenarios
- Performance benchmarks and stress tests
- Comparison with reference implementations
- Regression testing for optimization quality

### Running Tests

```bash
# Run all tests
cargo test

# Run specific test categories
cargo test --test data_driven_tests

# Run performance benchmarks
cargo test --test data_driven_tests -- --ignored

# Run with verbose output
cargo test -- --nocapture
```

### Test Case Structure

```yaml
# tests/test_cases/basic_optimization.yaml
name: "Basic Optimization Test"
description: "Tests fundamental optimization with repeat encounter constraints"
input:
  problem:
    people: [...]
    groups: [...]
    num_sessions: 3
  constraints: [...]
  solver: { ... }
expected:
  min_score: -50.0
  max_repetition_penalty: 0
  should_succeed: true
```

## 🎯 Performance Characteristics

### Computational Complexity

- **Time Complexity**: O(iterations × people × groups) per iteration
- **Space Complexity**: O(people² + people × sessions × groups)
- **Scalability**: Efficiently handles 100+ people, 10+ groups, 10+ sessions

### Optimization Benchmarks

| Problem Size | People | Groups | Sessions | Typical Time | Quality Score |
| ------------ | ------ | ------ | -------- | ------------ | ------------- |
| Small        | 12     | 3      | 3        | < 1s         | Near-optimal  |
| Medium       | 30     | 6      | 5        | 5-10s        | High quality  |
| Large        | 60     | 10     | 8        | 30-60s       | Good quality  |
| Enterprise   | 100+   | 15+    | 10+      | 2-5min       | Satisfactory  |

### Memory Usage

- **Contact Matrix**: O(people²) - tracks all pairwise encounters
- **Schedule Storage**: O(people × sessions) - current group assignments
- **Constraint Data**: O(constraints) - preprocessed constraint information

## 🏆 Key Innovations

### 1. Dual-Mode Optimization

Combines regular person swaps with intelligent clique swaps, automatically adapting move selection based on constraint density.

### 2. Constraint Preprocessing Intelligence

- **Automatic Clique Merging**: Overlapping "must-stay-together" constraints are merged using Union-Find algorithm
- **Conflict Detection**: Validates constraint compatibility during initialization
- **Session Filtering**: Efficiently applies constraints only to relevant sessions

### 3. Performance Optimizations

- **Integer-Based Internal Representation**: Fast array operations instead of string lookups
- **Delta Cost Evaluation**: Incremental cost calculation instead of full recalculation
- **Efficient Contact Tracking**: Sparse matrix representation for pairwise encounters

### 4. Rich Diagnostic Information

- **Detailed Score Breakdown**: Separate tracking of each optimization component
- **Constraint Violation Analysis**: Individual penalty tracking per constraint
- **Progress Monitoring**: Configurable logging for optimization debugging

## 🔄 Extension Points

### Adding New Algorithms

```rust
pub trait Solver {
    fn solve(&self, state: &mut State) -> Result<SolverResult, SolverError>;
}

// Implement for new algorithms
pub struct HillClimbing { /* ... */ }
impl Solver for HillClimbing { /* ... */ }
```

### Custom Constraint Types

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum Constraint {
    // Existing constraints...

    // Add new constraint type
    CustomConstraint(CustomConstraintParams),
}
```

### Alternative Objective Functions

```rust
pub struct Objective {
    pub r#type: String, // Add new objective types
    pub weight: f64,
}
```

## 📋 Dependencies

### Core Dependencies

- **serde**: Serialization/deserialization for solver data
- **rand**: High-quality random number generation for optimization
- **uuid**: Unique identifier generation
- **thiserror**: Structured error handling
- **log**: Configurable logging framework

### Development Dependencies

- **serde_json**: JSON parsing and generation
- **criterion**: Benchmark harness and HTML reports
- **proptest**: Property-based testing

## 🚀 Future Enhancements

### Planned Features

- **Genetic Algorithm**: Population-based optimization for larger problems
- **Parallel Processing**: Multi-threaded optimization for faster convergence
- **Machine Learning Integration**: Learning-based move selection
- **Interactive Optimization**: Real-time constraint adjustment
- **Multi-Objective Optimization**: Pareto-optimal solution sets

### Performance Improvements

- **SIMD Operations**: Vectorized calculations for large problems
- **GPU Acceleration**: CUDA/OpenCL support for massive parallelization
- **Memory Pool Allocation**: Reduced memory allocation overhead
- **Incremental Constraint Checking**: Faster constraint validation

---

## 📞 Support & Contribution

For questions, bug reports, or feature requests, please refer to the main project repository. The solver-core is designed to be extensible and welcomes contributions in optimization algorithms, constraint types, and performance improvements.
