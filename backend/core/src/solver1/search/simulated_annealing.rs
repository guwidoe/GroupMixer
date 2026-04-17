//! Simulated Annealing optimization algorithm implementation.
//!
//! This module implements a sophisticated Simulated Annealing algorithm specifically
//! designed for the Social Group Scheduling Problem. The algorithm uses temperature-based
//! acceptance probabilities to explore the solution space effectively, avoiding local
//! optima through controlled acceptance of worse solutions.
//!
//! # Algorithm Features
//!
//! - **Dual Move Types**: Regular person swaps and intelligent clique swaps
//! - **Adaptive Probability**: Dynamic adjustment between move types based on problem characteristics
//! - **Geometric Cooling**: Temperature decreases geometrically over iterations
//! - **Multiple Stop Conditions**: Iteration limits, time limits, and no-improvement detection
//! - **Comprehensive Logging**: Detailed progress tracking and debugging information
//!
//! # Temperature Schedule
//!
//! The algorithm uses a geometric cooling schedule:
//! ```text
//! temperature(i) = initial_temp × (final_temp / initial_temp)^(i / max_iterations)
//! ```
//!
//! This provides smooth temperature decay from high exploration to low exploitation.

use crate::models::{
    BenchmarkEvent, BenchmarkObserver, BenchmarkRunStarted, BestScoreTimelinePoint, MoveFamily,
    MoveFamilyBenchmarkTelemetry, MoveFamilyBenchmarkTelemetrySummary, MovePolicy,
    MoveSelectionMode, ProgressCallback, ProgressUpdate, SolverBenchmarkTelemetry,
    SolverConfiguration, SolverResult, StopReason,
};
use crate::runtime_target::displayed_total_iterations;
use crate::solver1::search::Solver;
use crate::solver1::{derive_phase_seed, State, SEARCH_SEED_SALT};
use crate::solver_support::SolverError;
use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha12Rng;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

// WASM-specific imports
#[cfg(target_arch = "wasm32")]
use js_sys;

// Platform-specific time handling
#[cfg(not(target_arch = "wasm32"))]
fn get_start_time() -> Instant {
    Instant::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn get_current_time() -> Instant {
    Instant::now()
}

#[cfg(target_arch = "wasm32")]
fn get_start_time() -> f64 {
    // Use js_sys::Date for more reliable time measurement in WASM
    js_sys::Date::now()
}

#[cfg(target_arch = "wasm32")]
fn get_current_time() -> f64 {
    // Use js_sys::Date for more reliable time measurement in WASM
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds(start_time: Instant) -> f64 {
    start_time.elapsed().as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds(start_time: f64) -> f64 {
    let now = js_sys::Date::now();
    (now - start_time) / 1000.0 // Convert milliseconds to seconds
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds_between(start: Instant, end: Instant) -> f64 {
    end.duration_since(start).as_secs_f64()
}

fn select_clique_source_group(state: &State, clique: &[usize], day: usize) -> Option<usize> {
    let num_groups = state.group_idx_to_id.len();
    let mut group_counts = vec![0usize; num_groups];

    for &member in clique {
        if state.person_participation[member][day] {
            let group_idx = state.locations[day][member].0;
            if group_idx < num_groups {
                group_counts[group_idx] += 1;
            }
        }
    }

    let mut best_group = None;
    let mut best_count = 0usize;
    for (group_idx, &count) in group_counts.iter().enumerate() {
        if count > best_count {
            best_count = count;
            best_group = Some(group_idx);
        }
    }

    best_group
}

fn static_move_candidates_for_day(state: &State, day: usize) -> Vec<usize> {
    (0..state.person_idx_to_id.len())
        .filter(|&person_idx| !state.immovable_people.contains_key(&(person_idx, day)))
        .filter(|&person_idx| state.person_to_clique_id[day][person_idx].is_none())
        .collect()
}

fn choose_target_group(
    num_groups: usize,
    excluded_group: usize,
    rng: &mut ChaCha12Rng,
    mut predicate: impl FnMut(usize) -> bool,
) -> Option<usize> {
    let mut selected = None;
    let mut seen = 0u32;

    for group_idx in 0..num_groups {
        if group_idx == excluded_group || !predicate(group_idx) {
            continue;
        }

        seen += 1;
        if rng.random_range(0..seen) == 0 {
            selected = Some(group_idx);
        }
    }

    selected
}

fn sample_non_clique_swap_targets(
    state: &State,
    day: usize,
    group_idx: usize,
    required_count: usize,
    rng: &mut ChaCha12Rng,
) -> Option<Vec<usize>> {
    if required_count == 0 {
        return Some(Vec::new());
    }

    let mut selected = Vec::with_capacity(required_count);
    let mut seen = 0u32;

    for &person_idx in &state.schedule[day][group_idx] {
        if !state.person_participation[person_idx][day]
            || state.person_to_clique_id[day][person_idx].is_some()
            || state.immovable_people.contains_key(&(person_idx, day))
        {
            continue;
        }

        seen += 1;
        if selected.len() < required_count {
            selected.push(person_idx);
            continue;
        }

        let slot = rng.random_range(0..seen);
        if (slot as usize) < required_count {
            selected[slot as usize] = person_idx;
        }
    }

    (selected.len() == required_count).then_some(selected)
}
#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds_between(start: f64, end: f64) -> f64 {
    (end - start) / 1000.0 // Convert milliseconds to seconds
}

fn cooling_progress_since_reheat(
    iterations_since_last_reheat: u64,
    remaining_iterations: u64,
    elapsed_since_last_reheat: f64,
    remaining_time_seconds: Option<f64>,
) -> f64 {
    let iter_progress = if remaining_iterations <= 1 {
        1.0
    } else {
        (iterations_since_last_reheat as f64 / (remaining_iterations - 1) as f64).clamp(0.0, 1.0)
    };

    let time_progress = match remaining_time_seconds {
        Some(limit) if limit > 0.0 => (elapsed_since_last_reheat / limit).clamp(0.0, 1.0),
        _ => 0.0,
    };

    iter_progress.max(time_progress)
}

fn temperature_for_cooling_progress(
    initial_temperature: f64,
    final_temperature: f64,
    cooling_progress: f64,
) -> f64 {
    initial_temperature
        * (final_temperature / initial_temperature).powf(cooling_progress.clamp(0.0, 1.0))
}

/// Comprehensive tracking structure for algorithm metrics.
///
/// Collects detailed statistics about move types, acceptance rates, score changes,
/// and other metrics valuable for algorithm tuning and user feedback.
#[derive(Debug, Clone)]
struct AlgorithmMetrics {
    // Move type counters
    clique_swaps_tried: u64,
    clique_swaps_accepted: u64,
    transfers_tried: u64,
    transfers_accepted: u64,
    swaps_tried: u64,
    swaps_accepted: u64,

    // Score tracking for averages
    attempted_deltas: Vec<f64>,
    accepted_deltas: Vec<f64>,
    biggest_accepted_increase: f64,
    biggest_attempted_increase: f64,

    // Recent acceptance tracking (circular buffer)
    recent_acceptances: Vec<bool>,
    recent_index: usize,

    // Score history for variance calculation
    recent_scores: Vec<f64>,
    score_index: usize,

    // Escape tracking
    local_optima_escapes: u64,

    // Best penalty breakdown tracking
    best_repetition_penalty: f64,
    best_balance_penalty: f64,
    best_constraint_penalty: f64,

    // Search efficiency tracking
    initial_score: f64,
}

impl AlgorithmMetrics {
    fn new(initial_score: f64) -> Self {
        Self {
            clique_swaps_tried: 0,
            clique_swaps_accepted: 0,
            transfers_tried: 0,
            transfers_accepted: 0,
            swaps_tried: 0,
            swaps_accepted: 0,
            attempted_deltas: Vec::new(),
            accepted_deltas: Vec::new(),
            biggest_accepted_increase: 0.0,
            biggest_attempted_increase: 0.0,
            recent_acceptances: vec![false; 100], // Last 100 moves
            recent_index: 0,
            recent_scores: vec![initial_score; 50], // Last 50 scores for variance
            score_index: 0,
            local_optima_escapes: 0,
            best_repetition_penalty: f64::INFINITY,
            best_balance_penalty: f64::INFINITY,
            best_constraint_penalty: f64::INFINITY,
            initial_score,
        }
    }

    fn record_clique_swap(&mut self, delta: f64, accepted: bool) {
        self.clique_swaps_tried += 1;
        if accepted {
            self.clique_swaps_accepted += 1;
        }
        self.record_move(delta, accepted);
    }

    fn record_transfer(&mut self, delta: f64, accepted: bool) {
        self.transfers_tried += 1;
        if accepted {
            self.transfers_accepted += 1;
        }
        self.record_move(delta, accepted);
    }

    fn record_swap(&mut self, delta: f64, accepted: bool) {
        self.swaps_tried += 1;
        if accepted {
            self.swaps_accepted += 1;
        }
        self.record_move(delta, accepted);
    }

    fn record_move(&mut self, delta: f64, accepted: bool) {
        // Track all attempted moves
        self.attempted_deltas.push(delta);
        if delta > self.biggest_attempted_increase {
            self.biggest_attempted_increase = delta;
        }

        // Track accepted moves
        if accepted {
            self.accepted_deltas.push(delta);
            if delta > self.biggest_accepted_increase {
                self.biggest_accepted_increase = delta;
            }

            // Track local optima escapes (accepted worse moves)
            if delta > 0.0 {
                self.local_optima_escapes += 1;
            }
        }

        // Update recent acceptance tracking (circular buffer)
        self.recent_acceptances[self.recent_index] = accepted;
        self.recent_index = (self.recent_index + 1) % self.recent_acceptances.len();
    }

    fn update_score(&mut self, new_score: f64) {
        // Update recent scores for variance calculation
        self.recent_scores[self.score_index] = new_score;
        self.score_index = (self.score_index + 1) % self.recent_scores.len();
    }

    fn update_best_penalties(
        &mut self,
        rep_penalty: f64,
        balance_penalty: f64,
        constraint_penalty: f64,
    ) {
        if rep_penalty < self.best_repetition_penalty {
            self.best_repetition_penalty = rep_penalty;
        }
        if balance_penalty < self.best_balance_penalty {
            self.best_balance_penalty = balance_penalty;
        }
        if constraint_penalty < self.best_constraint_penalty {
            self.best_constraint_penalty = constraint_penalty;
        }
    }

    fn calculate_metrics(
        &self,
        elapsed_seconds: f64,
    ) -> (f64, f64, f64, f64, f64, f64, f64, f64, f64) {
        // Overall acceptance rate
        let total_moves = self.clique_swaps_tried + self.transfers_tried + self.swaps_tried;
        let total_accepted =
            self.clique_swaps_accepted + self.transfers_accepted + self.swaps_accepted;
        let overall_acceptance_rate = if total_moves > 0 {
            total_accepted as f64 / total_moves as f64
        } else {
            0.0
        };

        // Recent acceptance rate
        let recent_accepted = self.recent_acceptances.iter().filter(|&&x| x).count();
        let recent_acceptance_rate = recent_accepted as f64 / self.recent_acceptances.len() as f64;

        // Average deltas
        let avg_attempted_delta = if !self.attempted_deltas.is_empty() {
            self.attempted_deltas.iter().sum::<f64>() / self.attempted_deltas.len() as f64
        } else {
            0.0
        };
        let avg_accepted_delta = if !self.accepted_deltas.is_empty() {
            self.accepted_deltas.iter().sum::<f64>() / self.accepted_deltas.len() as f64
        } else {
            0.0
        };

        // Success rates by move type
        let clique_swap_success_rate = if self.clique_swaps_tried > 0 {
            self.clique_swaps_accepted as f64 / self.clique_swaps_tried as f64
        } else {
            0.0
        };
        let transfer_success_rate = if self.transfers_tried > 0 {
            self.transfers_accepted as f64 / self.transfers_tried as f64
        } else {
            0.0
        };
        let swap_success_rate = if self.swaps_tried > 0 {
            self.swaps_accepted as f64 / self.swaps_tried as f64
        } else {
            0.0
        };

        // Score variance
        let mean_score = self.recent_scores.iter().sum::<f64>() / self.recent_scores.len() as f64;
        let score_variance = self
            .recent_scores
            .iter()
            .map(|score| (score - mean_score).powi(2))
            .sum::<f64>()
            / self.recent_scores.len() as f64;

        // Search efficiency (improvement per second)
        let current_best_score = self
            .recent_scores
            .iter()
            .fold(f64::INFINITY, |a, &b| a.min(b));
        let score_improvement = self.initial_score - current_best_score;
        let search_efficiency = if elapsed_seconds > 0.0 {
            score_improvement / elapsed_seconds
        } else {
            0.0
        };

        (
            overall_acceptance_rate,
            recent_acceptance_rate,
            avg_attempted_delta,
            avg_accepted_delta,
            clique_swap_success_rate,
            transfer_success_rate,
            swap_success_rate,
            score_variance,
            search_efficiency,
        )
    }
}

#[derive(Debug, Clone, Default)]
struct BenchmarkMoveTelemetry {
    swap: MoveFamilyBenchmarkTelemetry,
    transfer: MoveFamilyBenchmarkTelemetry,
    clique_swap: MoveFamilyBenchmarkTelemetry,
}

impl BenchmarkMoveTelemetry {
    fn family_mut(&mut self, family: MoveFamily) -> &mut MoveFamilyBenchmarkTelemetry {
        match family {
            MoveFamily::Swap => &mut self.swap,
            MoveFamily::Transfer => &mut self.transfer,
            MoveFamily::CliqueSwap => &mut self.clique_swap,
        }
    }

    fn into_summary(self) -> MoveFamilyBenchmarkTelemetrySummary {
        MoveFamilyBenchmarkTelemetrySummary {
            swap: self.swap,
            transfer: self.transfer,
            clique_swap: self.clique_swap,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct MoveFamilySelector {
    forced_family: Option<MoveFamily>,
    mode: MoveSelectionMode,
    allow_swap: bool,
    allow_transfer: bool,
    allow_clique_swap: bool,
    weighted_swap: f64,
    weighted_transfer: f64,
    weighted_clique_swap: f64,
}

impl MoveFamilySelector {
    fn new(move_policy: &MovePolicy) -> Self {
        let allow_swap = move_policy
            .allowed_families
            .as_ref()
            .is_none_or(|families| families.contains(&MoveFamily::Swap));
        let allow_transfer = move_policy
            .allowed_families
            .as_ref()
            .is_none_or(|families| families.contains(&MoveFamily::Transfer));
        let allow_clique_swap = move_policy
            .allowed_families
            .as_ref()
            .is_none_or(|families| families.contains(&MoveFamily::CliqueSwap));

        let (weighted_swap, weighted_transfer, weighted_clique_swap) = match move_policy.mode {
            MoveSelectionMode::Adaptive => (0.0, 0.0, 0.0),
            MoveSelectionMode::Weighted => {
                let weights = move_policy
                    .weights
                    .as_ref()
                    .expect("weighted policy should have been validated before solve");
                (weights.swap, weights.transfer, weights.clique_swap)
            }
        };

        Self {
            forced_family: move_policy.forced_family,
            mode: move_policy.mode,
            allow_swap,
            allow_transfer,
            allow_clique_swap,
            weighted_swap,
            weighted_transfer,
            weighted_clique_swap,
        }
    }

    fn sample(
        self,
        clique_swap_probability: f64,
        transfer_probability: f64,
        rng: &mut ChaCha12Rng,
    ) -> MoveFamily {
        if let Some(forced_family) = self.forced_family {
            return forced_family;
        }

        let (swap_weight, transfer_weight, clique_swap_weight) = match self.mode {
            MoveSelectionMode::Adaptive => (
                if self.allow_swap {
                    (1.0 - clique_swap_probability - transfer_probability).max(0.0)
                } else {
                    0.0
                },
                if self.allow_transfer {
                    transfer_probability.max(0.0)
                } else {
                    0.0
                },
                if self.allow_clique_swap {
                    clique_swap_probability.max(0.0)
                } else {
                    0.0
                },
            ),
            MoveSelectionMode::Weighted => (
                if self.allow_swap {
                    self.weighted_swap
                } else {
                    0.0
                },
                if self.allow_transfer {
                    self.weighted_transfer
                } else {
                    0.0
                },
                if self.allow_clique_swap {
                    self.weighted_clique_swap
                } else {
                    0.0
                },
            ),
        };

        let total_weight = swap_weight + transfer_weight + clique_swap_weight;
        if total_weight <= 0.0 {
            if self.allow_swap {
                return MoveFamily::Swap;
            }
            if self.allow_transfer {
                return MoveFamily::Transfer;
            }
            if self.allow_clique_swap {
                return MoveFamily::CliqueSwap;
            }
            return MoveFamily::Swap;
        }

        let selection = rng.random::<f64>() * total_weight;
        if selection < swap_weight {
            return MoveFamily::Swap;
        }
        if selection < swap_weight + transfer_weight {
            return MoveFamily::Transfer;
        }
        MoveFamily::CliqueSwap
    }
}

/// Simulated Annealing solver for the Social Group Scheduling Problem.
///
/// This implementation combines classical simulated annealing with domain-specific
/// optimizations for social group scheduling. It intelligently balances exploration
/// and exploitation while respecting complex constraints like clique integrity.
///
/// # Algorithm Overview
///
/// Simulated Annealing is a probabilistic optimization algorithm inspired by the
/// annealing process in metallurgy. It starts with high "temperature" allowing
/// many moves (including poor ones) and gradually "cools" to focus on improvements.
///
/// ## Key Components
///
/// 1. **Temperature Schedule**: Controls exploration vs exploitation balance
/// 2. **Move Generation**: Intelligent selection between person swaps and clique moves
/// 3. **Acceptance Criterion**: Metropolis criterion for probabilistic acceptance
/// 4. **Stop Conditions**: Multiple termination criteria for robust convergence
///
/// ## Move Types
///
/// ### Regular Swaps
/// - Swaps two individual people between groups
/// - Fast to evaluate and execute
/// - Good for fine-tuning solutions
///
/// ### Clique Swaps
/// - Moves entire cliques (groups that must stay together)
/// - More complex but respects constraint structure
/// - Essential for problems with many clique constraints
///
/// # Configuration
///
/// The algorithm is configured through `SimulatedAnnealingParams`:
/// - `initial_temperature`: Starting temperature (higher = more exploration)
/// - `final_temperature`: Ending temperature (lower = more focused)
/// - `cooling_schedule`: How temperature decreases (currently "geometric")
///
/// Stop conditions are configured through `StopConditions`:
/// - `max_iterations`: Maximum optimization iterations
/// - `time_limit_seconds`: Wall-clock time limit
/// - `no_improvement_iterations`: Early stopping on convergence
///
/// # Example Usage
///
/// ```no_run
/// use gm_core::algorithms::simulated_annealing::SimulatedAnnealing;
/// use gm_core::algorithms::Solver;
/// use gm_core::models::*;
/// use gm_core::solver::State;
/// use std::collections::HashMap;
///
/// // Configure the algorithm
/// let config = SolverConfiguration {
///     solver_type: "SimulatedAnnealing".to_string(),
///     stop_conditions: StopConditions {
///         max_iterations: Some(10000),
///         time_limit_seconds: Some(30),
///         no_improvement_iterations: Some(1000),
///         stop_on_optimal_score: true,
///     },
///     solver_params: SolverParams::SimulatedAnnealing(
///         SimulatedAnnealingParams {
///             initial_temperature: 100.0,  // High exploration
///             final_temperature: 0.01,     // Low exploitation
///             cooling_schedule: "geometric".to_string(),
///             reheat_after_no_improvement: Some(0),
///             reheat_cycles: Some(0),
///         }
///     ),
///     logging: LoggingOptions {
///         log_frequency: Some(1000),
///         log_duration_and_score: true,
///         log_final_score_breakdown: true,
///         ..Default::default()
///     },
///     telemetry: Default::default(),
///     seed: None,
///     move_policy: None,
///     allowed_sessions: None,
/// };
///
/// // Create and run the solver
/// let solver = SimulatedAnnealing::new(&config);
/// # let input = ApiInput {
/// #     initial_schedule: None,
/// #     construction_seed_schedule: None,
/// #     problem: ProblemDefinition {
/// #         people: vec![],
/// #         groups: vec![],
/// #         num_sessions: 1
/// #     },
/// #     objectives: vec![],
/// #     constraints: vec![],
/// #     solver: config,
/// # };
/// let mut state = State::new(&input)?;
/// let result = solver.solve(&mut state, None, None)?;
///
/// println!("Final score: {}", result.final_score);
/// println!("Unique contacts: {}", result.unique_contacts);
/// # Ok::<(), gm_core::solver::SolverError>(())
/// ```
///
/// # Performance Characteristics
///
/// - **Time Complexity**: O(iterations × move_evaluation_cost)
/// - **Space Complexity**: O(problem_size) for state storage plus cloning overhead
/// - **Convergence**: Typically requires 10,000-100,000 iterations for good solutions
/// - **Scaling**: Handles problems with hundreds of people and complex constraints
///
/// # Parameter Tuning Guidelines
///
/// ## Temperature Range
/// - **Initial Temperature**: Set high enough that ~80% of worse moves are initially accepted
/// - **Final Temperature**: Set low enough that only small improvements are accepted at the end
/// - **Rule of thumb**: `initial_temp / final_temp` ratio of 100-1000
///
/// ## Iteration Count
/// - **Small problems** (< 50 people): 10,000-50,000 iterations
/// - **Medium problems** (50-200 people): 50,000-200,000 iterations  
/// - **Large problems** (> 200 people): 200,000+ iterations
///
/// ## Stop Conditions
/// - **Time limits**: Use for production systems with response time requirements
/// - **No improvement**: Typically 5-10% of max_iterations for early stopping
/// - **Iteration limits**: Primary termination condition for consistent results
pub struct SimulatedAnnealing {
    /// Maximum number of optimization iterations to perform
    pub max_iterations: u64,
    /// Starting temperature for the annealing schedule
    pub initial_temperature: f64,
    /// Ending temperature for the annealing schedule
    pub final_temperature: f64,
    /// Optional wall-clock time limit in seconds
    pub time_limit_seconds: Option<u64>,
    /// Optional early stopping after this many iterations without improvement
    pub no_improvement_iterations: Option<u64>,
    /// Whether the solver should stop immediately once the best-known score reaches zero.
    pub stop_on_optimal_score: bool,
    /// When > 0, split the total iterations into this many cycles; each cycle cools from
    /// initial_temperature to final_temperature, then reheats at the boundary
    pub reheat_cycles: u64,
    /// Optional reheat threshold: number of iterations without improvement before reheating (0 = disabled)
    pub reheat_after_no_improvement: u64,
}

impl SimulatedAnnealing {
    /// Creates a new Simulated Annealing solver from configuration.
    ///
    /// Extracts the simulated annealing parameters from the solver configuration
    /// and sets up the algorithm with appropriate stop conditions.
    ///
    /// # Arguments
    ///
    /// * `params` - Complete solver configuration including SA parameters and stop conditions
    ///
    /// # Returns
    ///
    /// A configured `SimulatedAnnealing` instance ready to solve problems.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use gm_core::algorithms::simulated_annealing::SimulatedAnnealing;
    /// use gm_core::models::*;
    ///
    /// let config = SolverConfiguration {
    ///     solver_type: "SimulatedAnnealing".to_string(),
    ///     stop_conditions: StopConditions {
    ///         max_iterations: Some(50000),
    ///         time_limit_seconds: None,
    ///         no_improvement_iterations: Some(5000),
    ///         stop_on_optimal_score: true,
    ///     },
    ///     solver_params: SolverParams::SimulatedAnnealing(
    ///         SimulatedAnnealingParams {
    ///             initial_temperature: 50.0,
    ///             final_temperature: 0.1,
    ///             cooling_schedule: "geometric".to_string(),
    ///             reheat_cycles: Some(0),
    ///             reheat_after_no_improvement: Some(0),
    ///         }
    ///     ),
    ///     logging: LoggingOptions::default(),
    ///     telemetry: Default::default(),
    ///     seed: None,
    ///     move_policy: None,
    ///     allowed_sessions: None,
    /// };
    ///
    /// let solver = SimulatedAnnealing::new(&config);
    /// assert_eq!(solver.max_iterations, 50000);
    /// assert_eq!(solver.initial_temperature, 50.0);
    /// ```
    pub fn new(params: &SolverConfiguration) -> Self {
        let sa_params = params.simulated_annealing_params().expect(
            "simulated annealing engine should only be constructed after solver selection validation",
        );
        let max_iterations = params.stop_conditions.max_iterations.unwrap_or(100_000);
        let no_improvement_iterations = params.stop_conditions.no_improvement_iterations;

        // Determine cycle-based reheating
        let reheat_cycles = sa_params.reheat_cycles.unwrap_or(0);

        // Calculate reheat threshold:
        // - None => auto-calc default
        // - Some(0) => disabled
        // - Some(N>0) => use N
        let reheat_after_no_improvement = match sa_params.reheat_after_no_improvement {
            None => {
                let default_reheat = max_iterations / 10;
                if let Some(no_improvement) = no_improvement_iterations {
                    let half_no_improvement = no_improvement / 2;
                    default_reheat.min(half_no_improvement)
                } else {
                    default_reheat
                }
            }
            Some(v) => v,
        };

        Self {
            max_iterations,
            initial_temperature: sa_params.initial_temperature,
            final_temperature: sa_params.final_temperature,
            time_limit_seconds: params.stop_conditions.time_limit_seconds,
            no_improvement_iterations,
            stop_on_optimal_score: params.stop_conditions.stop_on_optimal_score,
            reheat_cycles,
            reheat_after_no_improvement,
        }
    }
}

impl Solver for SimulatedAnnealing {
    /// Executes the simulated annealing optimization algorithm.
    ///
    /// This method implements the complete simulated annealing optimization process,
    /// including temperature scheduling, move generation, acceptance decisions, and
    /// convergence detection. It modifies the provided state to find the best
    /// solution within the configured limits.
    ///
    /// # Algorithm Flow
    ///
    /// 1. **Initialization**: Set up tracking variables and log initial state
    /// 2. **Main Loop**: For each iteration:
    ///    - Calculate current temperature using geometric cooling
    ///    - Choose move type (regular swap vs clique swap) probabilistically
    ///    - Generate and evaluate a random move
    ///    - Accept/reject using Metropolis criterion
    ///    - Update best solution if improved
    ///    - Check stop conditions
    /// 3. **Finalization**: Return best solution found and log results
    ///
    /// # Move Selection Strategy
    ///
    /// The algorithm intelligently chooses between two move types:
    ///
    /// ## Clique Swaps (Probability-Based)
    /// - Triggered when `calculate_clique_swap_probability()` suggests it
    /// - Moves entire cliques while respecting constraints
    /// - More expensive but handles constraint structure better
    /// - Essential for problems with many "must-stay-together" constraints
    ///
    /// ## Regular Swaps (Default)
    /// - Swaps individual people between groups
    /// - Fast to evaluate and execute
    /// - Excludes immovable people and clique members
    /// - Good for fine-tuning and general optimization
    ///
    /// # Acceptance Criterion
    ///
    /// Uses the Metropolis criterion for probabilistic acceptance:
    /// ```text
    /// if delta_cost < 0:
    ///     accept (improvement)
    /// else:
    ///     accept with probability = exp(-delta_cost / temperature)
    /// ```
    ///
    /// This allows exploration of worse solutions early (high temperature) and
    /// focuses on improvements later (low temperature).
    ///
    /// # Arguments
    ///
    /// * `state` - Mutable reference to the problem state to optimize
    ///
    /// # Returns
    ///
    /// * `Ok(SolverResult)` - The best solution found with detailed scoring
    /// * `Err(SolverError)` - If an error occurs during optimization
    ///
    /// # Stop Conditions
    ///
    /// The algorithm stops when the first of these conditions is met:
    /// - **Max iterations**: Reached the configured iteration limit
    /// - **Time limit**: Exceeded the wall-clock time limit
    /// - **No improvement**: No better solution found for the specified number of iterations
    ///
    /// # Performance Notes
    ///
    /// - **Memory usage**: Maintains current state + best state (2x problem size)
    /// - **CPU usage**: Dominated by move evaluation and acceptance calculations
    /// - **Iteration speed**: Typically 100-10,000 iterations per second depending on problem size
    /// - **Convergence**: Usually finds good solutions within first 10-20% of iterations
    ///
    /// # Logging Output
    ///
    /// Controlled by `LoggingOptions`, the method can output:
    /// - Initial score breakdown
    /// - Periodic progress updates (temperature, contacts, penalties)
    /// - Stop condition messages
    /// - Final timing and score information
    /// - Detailed final score breakdown
    ///
    /// # Example Usage
    ///
    /// ```no_run
    /// use gm_core::algorithms::simulated_annealing::SimulatedAnnealing;
    /// use gm_core::algorithms::Solver;
    /// use gm_core::models::*;
    /// use gm_core::solver::State;
    /// use std::collections::HashMap;
    ///
    /// # let input = ApiInput {
    /// #     initial_schedule: None,
    /// #     construction_seed_schedule: None,
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None, stop_on_optimal_score: true },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0) }),
    /// #         logging: LoggingOptions::default(),
    /// #         telemetry: Default::default(),
    /// #         seed: None,
    /// #         move_policy: None,
    /// #         allowed_sessions: None,
    /// #     },
    /// # };
    /// // Set up the problem and solver
    /// let solver = SimulatedAnnealing::new(&input.solver);
    /// let mut state = State::new(&input)?;
    ///
    /// // Run optimization
    /// let result = solver.solve(&mut state, None, None)?;
    ///
    /// // Analyze results
    /// println!("Optimization completed!");
    /// println!("Final cost: {:.2}", result.final_score);
    /// println!("Unique contacts achieved: {}", result.unique_contacts);
    ///
    /// // Access the optimized schedule
    /// for (session, groups) in &result.schedule {
    ///     println!("{}:", session);
    ///     for (group_name, people) in groups {
    ///         println!("  {}: {:?}", group_name, people);
    ///     }
    /// }
    /// # Ok::<(), gm_core::solver::SolverError>(())
    /// ```
    ///
    /// # Algorithm Details
    ///
    /// ## Temperature Schedule
    /// ```text
    /// T(i) = T_initial × (T_final / T_initial)^(i / max_iterations)
    /// ```
    /// This geometric schedule provides smooth cooling from exploration to exploitation.
    ///
    /// ## Clique Swap Logic
    /// When attempting a clique swap:
    /// 1. Select a random clique
    /// 2. Find its current group location
    /// 3. Identify feasible target groups (capacity + constraints)
    /// 4. Select non-clique people to swap out
    /// 5. Evaluate cost delta for the complex move
    /// 6. Apply Metropolis acceptance criterion
    ///
    /// ## Regular Swap Logic
    /// When attempting a regular swap:
    /// 1. Filter to swappable people (non-immovable, non-clique)
    /// 2. Select two random people
    /// 3. Evaluate cost delta efficiently
    /// 4. Apply Metropolis acceptance criterion
    ///
    /// # Tuning Recommendations
    ///
    /// For **exploration problems** (many local optima):
    /// - Increase `initial_temperature`
    /// - Increase `max_iterations`
    /// - Use longer `no_improvement_iterations`
    ///
    /// For **exploitation problems** (single broad optimum):
    /// - Decrease `initial_temperature`
    /// - Decrease cooling rate (smaller `final_temperature`)
    /// - Use shorter iteration limits
    ///
    /// For **constraint-heavy problems**:
    /// - Increase constraint penalty weights
    /// - Monitor clique swap acceptance rates
    /// - Use longer optimization times
    fn solve(
        &self,
        state: &mut State,
        progress_callback: Option<&ProgressCallback>,
        benchmark_observer: Option<&BenchmarkObserver>,
    ) -> Result<SolverResult, SolverError> {
        let start_time = get_start_time();
        let mut rng =
            ChaCha12Rng::seed_from_u64(derive_phase_seed(state.effective_seed, SEARCH_SEED_SALT));
        let mut current_state = state.clone();
        let mut best_state = state.clone();
        let mut best_cost = state.calculate_cost();
        let mut no_improvement_counter = 0;
        let mut max_no_improvement_streak = 0u64;
        let mut last_callback_time = get_start_time();
        let mut progress_callback_count: u64 = 0;
        let mut final_iteration = 0;
        let mut iterations_completed = 0u64;
        let mut stop_reason = StopReason::MaxIterationsReached;
        let mut accepted_uphill_moves = 0u64;
        let mut accepted_downhill_moves = 0u64;
        let mut accepted_neutral_moves = 0u64;
        let initialization_finished_at = get_current_time();

        if state.logging.log_initial_score_breakdown {
            println!(
                "Initial state score breakdown: {}",
                state.format_score_breakdown()
            );
        }

        // Pre-calculate move probabilities for performance
        let transfer_probabilities: Vec<f64> = (0..current_state.num_sessions as usize)
            .map(|day| current_state.calculate_transfer_probability(day))
            .collect();

        let clique_swap_probabilities: Vec<f64> = current_state.calculate_clique_swap_probability();
        let move_family_selector = MoveFamilySelector::new(&state.move_policy);
        let movable_people_by_day: Vec<Vec<usize>> = (0..current_state.num_sessions as usize)
            .map(|day| static_move_candidates_for_day(&current_state, day))
            .collect();

        // Track reheating state
        let mut reheat_count = 0;
        let mut last_reheat_iteration = 0u64;
        let mut last_reheat_elapsed_seconds = 0.0_f64;
        let cycle_length = if self.reheat_cycles > 0 {
            // Avoid division by zero; ensure at least length 1
            (self.max_iterations / self.reheat_cycles).max(1)
        } else {
            0
        };
        let mut prev_cycle_index: Option<u64> = None;

        // Initialize algorithm metrics (convert start_time to f64 for cross-platform compatibility)
        let initial_score = state.calculate_cost();
        let mut best_score_timeline = vec![BestScoreTimelinePoint {
            iteration: 0,
            elapsed_seconds: 0.0,
            best_score: initial_score,
        }];

        let mut metrics = AlgorithmMetrics::new(initial_score);
        let mut benchmark_moves = BenchmarkMoveTelemetry::default();

        if let Some(observer) = benchmark_observer {
            observer(&BenchmarkEvent::RunStarted(BenchmarkRunStarted {
                effective_seed: state.effective_seed,
                move_policy: state.move_policy.clone(),
                initial_score,
            }));
        }

        let search_started_at = get_current_time();

        if self.stop_on_optimal_score && best_cost <= crate::models::OPTIMAL_SCORE_TOLERANCE {
            stop_reason = StopReason::OptimalScoreReached;
        }

        if stop_reason != StopReason::OptimalScoreReached {
            for i in 0..self.max_iterations {
                final_iteration = i;
                iterations_completed = i + 1;
                let elapsed_since_start = get_elapsed_seconds(start_time);

                // Two reheating modes:
                // 1) Fixed cycle-based reheats if reheat_cycles > 0
                // 2) Fallback: no-improvement-based reheats if enabled
                if self.reheat_cycles > 0 && cycle_length > 0 {
                    let cycle_index = i / cycle_length;
                    if let Some(prev) = prev_cycle_index {
                        if cycle_index > prev {
                            // We crossed a cycle boundary: perform a reheat
                            reheat_count += 1;
                            last_reheat_iteration = cycle_index * cycle_length;
                            last_reheat_elapsed_seconds = elapsed_since_start;
                            no_improvement_counter = 0;
                            if state.logging.log_stop_condition {
                                println!(
                                    "Reheating (cycle) #{} at iteration {} (cycle {} of {})",
                                    reheat_count,
                                    i,
                                    cycle_index + 1,
                                    self.reheat_cycles
                                );
                            }
                        }
                    }
                    prev_cycle_index = Some(cycle_index);
                } else if self.reheat_after_no_improvement > 0
                    && no_improvement_counter >= self.reheat_after_no_improvement
                    && no_improvement_counter > 0
                    && i - last_reheat_iteration > self.reheat_after_no_improvement
                {
                    // Only reheat if we haven't reheated recently
                    reheat_count += 1;
                    last_reheat_iteration = i;
                    last_reheat_elapsed_seconds = elapsed_since_start;
                    no_improvement_counter = 0; // Reset the no improvement counter

                    if state.logging.log_stop_condition {
                        println!(
                            "Reheating #{} at iteration {}: no improvement for {} iterations",
                            reheat_count, i, self.reheat_after_no_improvement
                        );
                    }
                }

                // Calculate temperature with potential reheat adjustment
                let (iterations_since_last_reheat, remaining_for_cooling) =
                    if self.reheat_cycles > 0 && cycle_length > 0 {
                        let cycle_index = i / cycle_length;
                        let cycle_start = cycle_index * cycle_length;
                        (i - cycle_start, cycle_length)
                    } else {
                        let iterations_since_last_reheat = i - last_reheat_iteration;
                        let remaining_iterations = self.max_iterations - last_reheat_iteration;
                        (iterations_since_last_reheat, remaining_iterations)
                    };

                let elapsed_since_last_reheat =
                    (elapsed_since_start - last_reheat_elapsed_seconds).max(0.0);
                let remaining_time_for_cooling = self
                    .time_limit_seconds
                    .map(|limit| (limit as f64 - last_reheat_elapsed_seconds).max(0.0));
                let cooling_progress = cooling_progress_since_reheat(
                    iterations_since_last_reheat,
                    remaining_for_cooling,
                    elapsed_since_last_reheat,
                    remaining_time_for_cooling,
                );
                let temperature = temperature_for_cooling_progress(
                    self.initial_temperature,
                    self.final_temperature,
                    cooling_progress,
                );

                let mut improvement_found = false;

                // Send progress update if callback is provided - every 0.1 seconds for responsiveness
                if let Some(callback) = &progress_callback {
                    let current_time = get_current_time();
                    let elapsed_since_last_callback =
                        get_elapsed_seconds_between(last_callback_time, current_time);

                    // Call on first iteration or after sufficient time has passed
                    // Add minimum 50ms gap to prevent excessive callbacks
                    // NOTE: We don't call on last iteration here because we send a final callback after recalculation
                    if i == 0 || elapsed_since_last_callback >= 0.1 {
                        progress_callback_count += 1;
                        let current_cost = current_state.current_cost;
                        let elapsed = elapsed_since_start;
                        let iterations_since_last_reheat =
                            if self.reheat_cycles > 0 && cycle_length > 0 {
                                i - ((i / cycle_length) * cycle_length)
                            } else {
                                i - last_reheat_iteration
                            };

                        // Calculate dynamic metrics
                        let (
                            overall_acceptance_rate,
                            recent_acceptance_rate,
                            avg_attempted_move_delta,
                            avg_accepted_move_delta,
                            clique_swap_success_rate,
                            transfer_success_rate,
                            swap_success_rate,
                            score_variance,
                            search_efficiency,
                        ) = metrics.calculate_metrics(elapsed);

                        let remaining_iterations_for_progress =
                            if self.reheat_cycles > 0 && cycle_length > 0 {
                                cycle_length
                            } else {
                                self.max_iterations - last_reheat_iteration
                            };
                        let elapsed_since_last_reheat =
                            (elapsed - last_reheat_elapsed_seconds).max(0.0);
                        let remaining_time_for_progress = self
                            .time_limit_seconds
                            .map(|limit| (limit as f64 - last_reheat_elapsed_seconds).max(0.0));
                        let cooling_progress = cooling_progress_since_reheat(
                            iterations_since_last_reheat,
                            remaining_iterations_for_progress,
                            elapsed_since_last_reheat,
                            remaining_time_for_progress,
                        );

                        // Calculate average time per iteration
                        let avg_time_per_iteration_ms = if i > 0 {
                            (elapsed * 1000.0) / i as f64
                        } else {
                            0.0
                        };

                        let include_best_schedule = if state.telemetry.emit_best_schedule {
                            let every = state.telemetry.best_schedule_every_n_callbacks.max(1);
                            progress_callback_count.is_multiple_of(every)
                        } else {
                            false
                        };

                        let progress = ProgressUpdate {
                            // Basic progress information
                            iteration: i + 1, // Report 1-based iteration numbers
                            max_iterations: displayed_total_iterations(
                                i + 1,
                                self.max_iterations,
                                elapsed,
                                self.time_limit_seconds,
                                None,
                            ),
                            temperature,
                            current_score: current_cost,
                            best_score: best_cost,
                            current_contacts: current_state.unique_contacts,
                            best_contacts: best_state.unique_contacts,
                            repetition_penalty: current_state.repetition_penalty,
                            elapsed_seconds: elapsed,
                            no_improvement_count: no_improvement_counter,

                            // Move type statistics
                            clique_swaps_tried: metrics.clique_swaps_tried,
                            clique_swaps_accepted: metrics.clique_swaps_accepted,
                            clique_swaps_rejected: metrics.clique_swaps_tried
                                - metrics.clique_swaps_accepted,
                            transfers_tried: metrics.transfers_tried,
                            transfers_accepted: metrics.transfers_accepted,
                            transfers_rejected: metrics.transfers_tried
                                - metrics.transfers_accepted,
                            swaps_tried: metrics.swaps_tried,
                            swaps_accepted: metrics.swaps_accepted,
                            swaps_rejected: metrics.swaps_tried - metrics.swaps_accepted,

                            // Acceptance and quality metrics
                            overall_acceptance_rate,
                            recent_acceptance_rate,
                            avg_attempted_move_delta,
                            avg_accepted_move_delta,
                            biggest_accepted_increase: metrics.biggest_accepted_increase,
                            biggest_attempted_increase: metrics.biggest_attempted_increase,

                            // Current state breakdown
                            current_repetition_penalty: current_state.repetition_penalty as f64
                                * current_state.w_repetition,
                            current_balance_penalty: current_state.attribute_balance_penalty,
                            current_constraint_penalty: current_state.weighted_constraint_penalty,
                            best_repetition_penalty: metrics.best_repetition_penalty,
                            best_balance_penalty: metrics.best_balance_penalty,
                            best_constraint_penalty: metrics.best_constraint_penalty,

                            // Algorithm state information
                            reheats_performed: reheat_count,
                            iterations_since_last_reheat,
                            local_optima_escapes: metrics.local_optima_escapes,
                            avg_time_per_iteration_ms,
                            cooling_progress,

                            // Move type success rates
                            clique_swap_success_rate,
                            transfer_success_rate,
                            swap_success_rate,

                            // Advanced analytics
                            score_variance,
                            search_efficiency,
                            // Optional best schedule snapshot (expensive; gated by telemetry settings)
                            best_schedule: if include_best_schedule {
                                Some(
                                    best_state
                                        .to_solver_result(best_cost, no_improvement_counter)
                                        .schedule,
                                )
                            } else {
                                None
                            },
                            effective_seed: Some(state.effective_seed),
                            move_policy: Some(state.move_policy.clone()),
                            stop_reason: None,
                        };

                        // If callback returns false, stop early
                        if !callback(&progress) {
                            stop_reason = StopReason::ProgressCallbackRequestedStop;
                            if state.logging.log_stop_condition {
                                println!(
                                    "Stopping early: progress callback requested termination."
                                );
                            }
                            break;
                        }

                        // Only update callback time if we actually called the callback
                        last_callback_time = current_time;
                    }
                }

                // --- Choose a random move (respect allowed sessions if configured) ---
                let day = if let Some(ref allowed) = state.allowed_sessions {
                    if allowed.is_empty() {
                        continue;
                    }
                    let idx = rng.random_range(0..allowed.len());
                    allowed[idx] as usize
                } else {
                    rng.random_range(0..current_state.num_sessions as usize)
                };

                // Use pre-calculated move probabilities for performance
                let transfer_probability = transfer_probabilities[day];
                let clique_swap_probability = clique_swap_probabilities[day];
                let chosen_family = move_family_selector.sample(
                    clique_swap_probability,
                    transfer_probability,
                    &mut rng,
                );

                if chosen_family == MoveFamily::CliqueSwap {
                    // === CLIQUE SWAP ===
                    // --- Attempt Clique Swap ---
                    let clique_idx = rng.random_range(0..current_state.cliques.len());
                    let clique = &current_state.cliques[clique_idx];

                    // Determine a source group containing the majority of active (participating)
                    // members of this clique for the selected day. Tie-breaking is deterministic.
                    let current_group = if let Some(group_idx) =
                        select_clique_source_group(&current_state, clique, day)
                    {
                        group_idx
                    } else {
                        continue; // No active members this day
                    };

                    // Count active members actually in current_group
                    let active_count = clique
                        .iter()
                        .filter(|&&m| current_state.person_participation[m][day])
                        .filter(|&&m| current_state.locations[day][m].0 == current_group)
                        .count();
                    if active_count == 0 {
                        continue;
                    }

                    // Find a different group to swap with
                    let num_groups = current_state.group_idx_to_id.len();
                    let maybe_target_group =
                        choose_target_group(num_groups, current_group, &mut rng, |group_idx| {
                            current_state.is_clique_swap_feasible(
                                day,
                                clique_idx,
                                current_group,
                                group_idx,
                            )
                        });

                    if let Some(target_group) = maybe_target_group {
                        if let Some(target_people) = sample_non_clique_swap_targets(
                            &current_state,
                            day,
                            target_group,
                            active_count,
                            &mut rng,
                        ) {
                            // Calculate delta cost for clique swap
                            let preview_started_at = get_current_time();
                            let delta_cost = current_state.calculate_clique_swap_cost_delta(
                                day,
                                clique_idx,
                                current_group,
                                target_group,
                                &target_people,
                            );
                            let preview_seconds =
                                get_elapsed_seconds_between(preview_started_at, get_current_time());
                            // By default, record the estimated delta; if accepted, override with actual delta
                            let mut recorded_delta = delta_cost;
                            let telemetry = benchmark_moves.family_mut(MoveFamily::CliqueSwap);
                            telemetry.attempts += 1;
                            telemetry.preview_seconds += preview_seconds;

                            //let current_cost = current_state.current_cost;
                            //let next_cost = current_cost + delta_cost;

                            // Accept or reject the clique swap
                            let move_accepted = delta_cost < 0.0
                                || rng.random::<f64>() < (-delta_cost / temperature).exp();

                            if move_accepted {
                                let prev_cost = current_state.current_cost;
                                let apply_started_at = get_current_time();
                                current_state.apply_clique_swap(
                                    day,
                                    clique_idx,
                                    current_group,
                                    target_group,
                                    &target_people,
                                );
                                let apply_finished_at = get_current_time();
                                let apply_seconds = get_elapsed_seconds_between(
                                    apply_started_at,
                                    apply_finished_at,
                                );
                                telemetry.apply_seconds += apply_seconds;

                                let actual_current_cost = current_state.current_cost;
                                recorded_delta = actual_current_cost - prev_cost;

                                #[cfg(feature = "debug-invariant-checks")]
                                {
                                    // Optional invariant check after applying move
                                    if state.logging.debug_validate_invariants {
                                        if let Err(e) =
                                            current_state.validate_no_duplicate_assignments()
                                        {
                                            if state.logging.debug_dump_invariant_context {
                                                println!("INVARIANT VIOLATION CONTEXT:");
                                                println!("  Iteration: {}", i);
                                                println!("  Move: CLIQUE_SWAP day={} clique_idx={} from_group={} to_group={} swapped_out={}",
                                                day,
                                                clique_idx,
                                                state.group_idx_to_id[current_group].clone(),
                                                state.group_idx_to_id[target_group].clone(),
                                                target_people.len()
                                            );
                                                for (g_idx, g) in current_state.schedule[day]
                                                    .iter()
                                                    .enumerate()
                                                    .take(4)
                                                {
                                                    let names: Vec<String> = g
                                                        .iter()
                                                        .map(|&pid| {
                                                            current_state.display_person_by_idx(pid)
                                                        })
                                                        .collect();
                                                    println!(
                                                        "    group {} ({}): {:?}",
                                                        g_idx,
                                                        current_state.group_idx_to_id[g_idx]
                                                            .clone(),
                                                        names
                                                    );
                                                }
                                            }
                                            return Err(e);
                                        }
                                    }
                                }

                                if actual_current_cost < best_cost {
                                    best_cost = actual_current_cost;
                                    best_state = current_state.clone();
                                    no_improvement_counter = 0;
                                    improvement_found = true;
                                    best_score_timeline.push(BestScoreTimelinePoint {
                                        iteration: i + 1,
                                        elapsed_seconds: get_elapsed_seconds(start_time),
                                        best_score: best_cost,
                                    });
                                }
                            }

                            if move_accepted {
                                telemetry.accepted += 1;
                                if recorded_delta < 0.0 {
                                    telemetry.improving_accepts += 1;
                                    accepted_downhill_moves += 1;
                                } else if recorded_delta > 0.0 {
                                    accepted_uphill_moves += 1;
                                } else {
                                    accepted_neutral_moves += 1;
                                }
                            } else {
                                telemetry.rejected += 1;
                            }

                            // Record using chosen delta (actual if accepted, estimated otherwise)
                            metrics.record_clique_swap(recorded_delta, move_accepted);
                        }
                    }
                } else if chosen_family == MoveFamily::Transfer {
                    // === SINGLE PERSON TRANSFER ===
                    let transferable_people = &movable_people_by_day[day];

                    if !transferable_people.is_empty() {
                        let person_idx =
                            transferable_people[rng.random_range(0..transferable_people.len())];
                        let (from_group, _) = current_state.locations[day][person_idx];

                        // Find potential target groups
                        let num_groups = current_state.group_idx_to_id.len();
                        let maybe_to_group =
                            choose_target_group(num_groups, from_group, &mut rng, |group_idx| {
                                current_state
                                    .is_transfer_feasible(day, person_idx, from_group, group_idx)
                            });

                        if let Some(to_group) = maybe_to_group {
                            // Calculate delta cost for transfer
                            let preview_started_at = get_current_time();
                            let delta_cost = current_state.calculate_transfer_cost_delta(
                                day, person_idx, from_group, to_group,
                            );
                            let preview_seconds =
                                get_elapsed_seconds_between(preview_started_at, get_current_time());
                            let current_cost = current_state.current_cost;
                            let next_cost = current_cost + delta_cost;
                            let telemetry = benchmark_moves.family_mut(MoveFamily::Transfer);
                            telemetry.attempts += 1;
                            telemetry.preview_seconds += preview_seconds;

                            // Accept or reject the transfer
                            let move_accepted = delta_cost < 0.0
                                || rng.random::<f64>() < (-delta_cost / temperature).exp();

                            if move_accepted {
                                let apply_started_at = get_current_time();
                                current_state.apply_transfer(day, person_idx, from_group, to_group);
                                telemetry.apply_seconds += get_elapsed_seconds_between(
                                    apply_started_at,
                                    get_current_time(),
                                );

                                current_state.current_cost = next_cost;

                                #[cfg(feature = "debug-invariant-checks")]
                                {
                                    // Optional invariant check after applying move
                                    if state.logging.debug_validate_invariants {
                                        if let Err(e) =
                                            current_state.validate_no_duplicate_assignments()
                                        {
                                            if state.logging.debug_dump_invariant_context {
                                                println!("INVARIANT VIOLATION CONTEXT:");
                                                println!("  Iteration: {}", i);
                                                println!(
                                                "  Move: TRANSFER day={} person={} from={} to={}",
                                                day,
                                                current_state.display_person_by_idx(person_idx),
                                                state.group_idx_to_id[from_group].clone(),
                                                state.group_idx_to_id[to_group].clone()
                                            );
                                                for (g_idx, g) in current_state.schedule[day]
                                                    .iter()
                                                    .enumerate()
                                                    .take(4)
                                                {
                                                    let names: Vec<String> = g
                                                        .iter()
                                                        .map(|&pid| {
                                                            current_state.display_person_by_idx(pid)
                                                        })
                                                        .collect();
                                                    println!(
                                                        "    group {} ({}): {:?}",
                                                        g_idx,
                                                        current_state.group_idx_to_id[g_idx]
                                                            .clone(),
                                                        names
                                                    );
                                                }
                                            }
                                            return Err(e);
                                        }
                                    }
                                }

                                if next_cost < best_cost {
                                    // Recalculate to eliminate any incremental drift before
                                    // recording a new best and to keep telemetry consistent.
                                    let recalc_started_at = get_current_time();
                                    current_state._recalculate_scores();
                                    let verified_cost = current_state.calculate_cost();
                                    telemetry.full_recalculation_count += 1;
                                    telemetry.full_recalculation_seconds +=
                                        get_elapsed_seconds_between(
                                            recalc_started_at,
                                            get_current_time(),
                                        );
                                    if verified_cost < best_cost {
                                        best_cost = verified_cost;
                                        best_state = current_state.clone();
                                        no_improvement_counter = 0;
                                        improvement_found = true;
                                        best_score_timeline.push(BestScoreTimelinePoint {
                                            iteration: i + 1,
                                            elapsed_seconds: get_elapsed_seconds(start_time),
                                            best_score: best_cost,
                                        });
                                    }
                                }
                            }

                            if move_accepted {
                                telemetry.accepted += 1;
                                if delta_cost < 0.0 {
                                    telemetry.improving_accepts += 1;
                                    accepted_downhill_moves += 1;
                                } else if delta_cost > 0.0 {
                                    accepted_uphill_moves += 1;
                                } else {
                                    accepted_neutral_moves += 1;
                                }
                            } else {
                                telemetry.rejected += 1;
                            }

                            // Record the move attempt
                            metrics.record_transfer(delta_cost, move_accepted);
                        }
                    }
                } else {
                    // === REGULAR PERSON SWAP ===
                    let swappable_people = &movable_people_by_day[day];

                    if swappable_people.len() < 2 {
                        continue;
                    }

                    // Pick two non-clique, non-immovable people for a swap
                    let p1_idx = swappable_people[rng.random_range(0..swappable_people.len())];
                    let mut p2_idx = swappable_people[rng.random_range(0..swappable_people.len())];
                    while p1_idx == p2_idx {
                        p2_idx = swappable_people[rng.random_range(0..swappable_people.len())];
                    }

                    // --- Evaluate the swap ---
                    let preview_started_at = get_current_time();
                    let delta_cost = current_state.calculate_swap_cost_delta(day, p1_idx, p2_idx);
                    let preview_seconds =
                        get_elapsed_seconds_between(preview_started_at, get_current_time());
                    let current_cost = current_state.current_cost;
                    let next_cost = current_cost + delta_cost;
                    let telemetry = benchmark_moves.family_mut(MoveFamily::Swap);
                    telemetry.attempts += 1;
                    telemetry.preview_seconds += preview_seconds;

                    let move_accepted =
                        delta_cost < 0.0 || rng.random::<f64>() < (-delta_cost / temperature).exp();

                    if move_accepted {
                        // Debug: For zero temperature, we should only accept improving moves
                        if temperature == 0.0 && delta_cost >= 0.0 {
                            println!("WARNING: Hill climbing violation!");
                            println!("  temperature: {}", temperature);
                            println!("  delta_cost: {}", delta_cost);
                            println!("  accepted non-improving move with zero temperature");
                        }

                        let apply_started_at = get_current_time();
                        current_state.apply_swap(day, p1_idx, p2_idx);
                        telemetry.apply_seconds +=
                            get_elapsed_seconds_between(apply_started_at, get_current_time());
                        current_state.current_cost = next_cost;

                        #[cfg(feature = "debug-invariant-checks")]
                        {
                            // Optional invariant check after applying move
                            if state.logging.debug_validate_invariants {
                                if let Err(e) = current_state.validate_no_duplicate_assignments() {
                                    if state.logging.debug_dump_invariant_context {
                                        println!("INVARIANT VIOLATION CONTEXT:");
                                        println!("  Iteration: {}", i);
                                        println!(
                                            "  Move: SWAP day={} p1={} p2={}",
                                            day,
                                            current_state.display_person_by_idx(p1_idx),
                                            current_state.display_person_by_idx(p2_idx)
                                        );
                                        println!("  After move (first 3 groups of day):");
                                        for (g_idx, g) in
                                            current_state.schedule[day].iter().enumerate().take(3)
                                        {
                                            let names: Vec<String> = g
                                                .iter()
                                                .map(|&pid| {
                                                    current_state.display_person_by_idx(pid)
                                                })
                                                .collect();
                                            println!(
                                                "    group {} ({}): {:?}",
                                                g_idx,
                                                current_state.group_idx_to_id[g_idx].clone(),
                                                names
                                            );
                                        }
                                    }
                                    return Err(e);
                                }
                            }
                        }

                        if next_cost < best_cost {
                            // Recalculate to eliminate any incremental drift before
                            // recording a new best and to keep telemetry consistent.
                            let recalc_started_at = get_current_time();
                            current_state._recalculate_scores();
                            let verified_cost = current_state.calculate_cost();
                            telemetry.full_recalculation_count += 1;
                            telemetry.full_recalculation_seconds +=
                                get_elapsed_seconds_between(recalc_started_at, get_current_time());
                            if verified_cost < best_cost {
                                best_cost = verified_cost;
                                best_state = current_state.clone();
                                no_improvement_counter = 0;
                                improvement_found = true;
                                best_score_timeline.push(BestScoreTimelinePoint {
                                    iteration: i + 1,
                                    elapsed_seconds: get_elapsed_seconds(start_time),
                                    best_score: best_cost,
                                });
                            }
                        }
                    }

                    if move_accepted {
                        telemetry.accepted += 1;
                        if delta_cost < 0.0 {
                            telemetry.improving_accepts += 1;
                            accepted_downhill_moves += 1;
                        } else if delta_cost > 0.0 {
                            accepted_uphill_moves += 1;
                        } else {
                            accepted_neutral_moves += 1;
                        }
                    } else {
                        telemetry.rejected += 1;
                    }

                    // Record the move attempt
                    metrics.record_swap(delta_cost, move_accepted);
                }

                // --- Logging ---
                // Commented out for performance - this was causing overhead during optimization
                // if let Some(freq @ 1..) = state.logging.log_frequency {
                //     if i > 0 && i % freq == 0 {
                //         println!(
                //             "Iter {}: Temp={:.4}, Contacts={}, Rep Penalty={}",
                //             i,
                //             temperature,
                //             current_state.unique_contacts,
                //             current_state.repetition_penalty
                //         );
                //     }
                // }

                // --- Stop Conditions ---
                if !improvement_found {
                    no_improvement_counter += 1;
                    max_no_improvement_streak =
                        max_no_improvement_streak.max(no_improvement_counter);
                }

                if self.stop_on_optimal_score && best_cost <= crate::models::OPTIMAL_SCORE_TOLERANCE
                {
                    stop_reason = StopReason::OptimalScoreReached;
                    if state.logging.log_stop_condition {
                        println!("Stopping early: optimal score of 0 reached.");
                    }
                    break;
                }

                if let Some(no_improvement_limit) = self.no_improvement_iterations {
                    if no_improvement_counter >= no_improvement_limit {
                        stop_reason = StopReason::NoImprovementLimitReached;
                        if state.logging.log_stop_condition {
                            println!(
                            "Stopping early: no improvement for {no_improvement_limit} iterations."
                        );
                        }
                        break;
                    }
                }

                if let Some(time_limit) = self.time_limit_seconds {
                    if elapsed_since_start >= time_limit as f64 {
                        stop_reason = StopReason::TimeLimitReached;
                        if state.logging.log_stop_condition {
                            println!("Stopping early: time limit of {time_limit} seconds reached.");
                        }
                        break;
                    }
                }

                // Update algorithm metrics (delta tracking handled in individual move blocks)
                metrics.update_score(current_state.current_cost);
                metrics.update_best_penalties(
                    current_state.repetition_penalty as f64 * current_state.w_repetition,
                    current_state.attribute_balance_penalty,
                    current_state.weighted_constraint_penalty,
                );
            }
        }

        let search_finished_at = get_current_time();

        // Validate that our incremental tracking matches full recalculation
        let recalculated_cost = best_state.calculate_cost();
        if (recalculated_cost - best_cost).abs() > 0.001 {
            println!("WARNING: Algorithm inconsistency detected!");
            println!("  tracked best_cost: {}", best_cost);
            println!("  recalculated cost: {}", recalculated_cost);
            println!("  difference: {}", (recalculated_cost - best_cost).abs());
            // Keep telemetry consistent in the final callback by reporting the
            // recalculated value. We avoid mutating best_cost here to prevent
            // an unused assignment warning and because subsequent logic uses
            // final_cost derived from best_state.
        }

        // Recalculate scores to ensure accuracy
        best_state._recalculate_scores();
        let final_cost = best_state.calculate_cost();
        let finalization_finished_at = get_current_time();
        let initialization_seconds =
            get_elapsed_seconds_between(start_time, initialization_finished_at);
        let search_seconds = get_elapsed_seconds_between(search_started_at, search_finished_at);
        let finalization_seconds =
            get_elapsed_seconds_between(search_finished_at, finalization_finished_at);
        let total_seconds = get_elapsed_seconds_between(start_time, finalization_finished_at);
        let benchmark_telemetry = SolverBenchmarkTelemetry {
            effective_seed: state.effective_seed,
            move_policy: state.move_policy.clone(),
            stop_reason,
            iterations_completed,
            no_improvement_count: no_improvement_counter,
            max_no_improvement_streak,
            reheats_performed: reheat_count,
            accepted_uphill_moves,
            accepted_downhill_moves,
            accepted_neutral_moves,
            restart_count: Some(reheat_count),
            perturbation_count: None,
            initial_score,
            best_score: best_cost,
            final_score: final_cost,
            initialization_seconds,
            search_seconds,
            finalization_seconds,
            total_seconds,
            iterations_per_second: if search_seconds > 0.0 {
                iterations_completed as f64 / search_seconds
            } else {
                0.0
            },
            best_score_timeline,
            repeat_guided_swaps: crate::models::RepeatGuidedSwapBenchmarkTelemetry::default(),
            sgp_week_pair_tabu: None,
            memetic: None,
            donor_session_transplant: None,
            session_aligned_path_relinking: None,
            multi_root_balanced_session_inheritance: None,
            solver4_paper_trace: None,
            moves: benchmark_moves.into_summary(),
        };

        if let Some(observer) = benchmark_observer {
            observer(&BenchmarkEvent::RunCompleted(benchmark_telemetry.clone()));
        }

        // Send final progress update if callback is provided
        // IMPORTANT: This must happen AFTER _recalculate_scores() to ensure accurate scores
        if let Some(callback) = &progress_callback {
            let (iterations_since_last_reheat, remaining_for_cooling) =
                if self.reheat_cycles > 0 && cycle_length > 0 {
                    let cycle_index = final_iteration / cycle_length;
                    let cycle_start = cycle_index * cycle_length;
                    (final_iteration - cycle_start, cycle_length)
                } else {
                    let iterations_since_last_reheat = final_iteration - last_reheat_iteration;
                    let remaining_iterations = self.max_iterations - last_reheat_iteration;
                    (iterations_since_last_reheat, remaining_iterations)
                };

            let elapsed = get_elapsed_seconds(start_time);
            let elapsed_since_last_reheat = (elapsed - last_reheat_elapsed_seconds).max(0.0);
            let remaining_time_for_cooling = self
                .time_limit_seconds
                .map(|limit| (limit as f64 - last_reheat_elapsed_seconds).max(0.0));
            let cooling_progress = cooling_progress_since_reheat(
                iterations_since_last_reheat,
                remaining_for_cooling,
                elapsed_since_last_reheat,
                remaining_time_for_cooling,
            );
            let final_temperature = temperature_for_cooling_progress(
                self.initial_temperature,
                self.final_temperature,
                cooling_progress,
            );

            let (
                overall_acceptance_rate,
                recent_acceptance_rate,
                avg_attempted_move_delta,
                avg_accepted_move_delta,
                clique_swap_success_rate,
                transfer_success_rate,
                swap_success_rate,
                score_variance,
                search_efficiency,
            ) = metrics.calculate_metrics(elapsed);

            let avg_time_per_iteration_ms = if iterations_completed > 0 {
                (elapsed * 1000.0) / iterations_completed as f64
            } else {
                0.0
            };

            let final_progress = ProgressUpdate {
                // Basic progress information
                iteration: iterations_completed,
                max_iterations: displayed_total_iterations(
                    iterations_completed,
                    self.max_iterations,
                    elapsed,
                    self.time_limit_seconds,
                    Some(stop_reason),
                ),
                temperature: final_temperature,
                current_score: final_cost, // Use the recalculated final_cost
                // Report the tracked best_cost (kept consistent when recording bests)
                best_score: best_cost,
                current_contacts: best_state.unique_contacts, // These are now recalculated
                best_contacts: best_state.unique_contacts,    // These are now recalculated
                repetition_penalty: best_state.repetition_penalty, // This is now recalculated
                elapsed_seconds: elapsed,
                no_improvement_count: no_improvement_counter,

                // Move type statistics
                clique_swaps_tried: metrics.clique_swaps_tried,
                clique_swaps_accepted: metrics.clique_swaps_accepted,
                clique_swaps_rejected: metrics.clique_swaps_tried - metrics.clique_swaps_accepted,
                transfers_tried: metrics.transfers_tried,
                transfers_accepted: metrics.transfers_accepted,
                transfers_rejected: metrics.transfers_tried - metrics.transfers_accepted,
                swaps_tried: metrics.swaps_tried,
                swaps_accepted: metrics.swaps_accepted,
                swaps_rejected: metrics.swaps_tried - metrics.swaps_accepted,

                // Acceptance and quality metrics
                overall_acceptance_rate,
                recent_acceptance_rate,
                avg_attempted_move_delta,
                avg_accepted_move_delta,
                biggest_accepted_increase: metrics.biggest_accepted_increase,
                biggest_attempted_increase: metrics.biggest_attempted_increase,

                // Current state breakdown
                current_repetition_penalty: best_state.repetition_penalty as f64
                    * best_state.w_repetition,
                current_balance_penalty: best_state.attribute_balance_penalty,
                current_constraint_penalty: best_state.weighted_constraint_penalty,
                best_repetition_penalty: metrics.best_repetition_penalty,
                best_balance_penalty: metrics.best_balance_penalty,
                best_constraint_penalty: metrics.best_constraint_penalty,

                // Algorithm state information
                reheats_performed: reheat_count,
                iterations_since_last_reheat,
                local_optima_escapes: metrics.local_optima_escapes,
                avg_time_per_iteration_ms,
                cooling_progress,

                // Move type success rates
                clique_swap_success_rate,
                transfer_success_rate,
                swap_success_rate,

                // Advanced analytics
                score_variance,
                search_efficiency,
                best_schedule: if state.telemetry.emit_best_schedule {
                    Some(
                        best_state
                            .to_solver_result(best_cost, no_improvement_counter)
                            .schedule,
                    )
                } else {
                    None
                },
                effective_seed: Some(state.effective_seed),
                move_policy: Some(state.move_policy.clone()),
                stop_reason: Some(stop_reason),
            };

            // Call the callback one final time (ignore return value since we're done)
            callback(&final_progress);
        }

        // Update the state parameter with the final optimized state
        *state = best_state.clone();
        state._recalculate_scores();

        let elapsed = total_seconds;

        if state.logging.log_duration_and_score {
            println!("Solver finished in {elapsed:.2} seconds. Final score: {final_cost:.2}");
        }

        if state.logging.log_final_score_breakdown {
            println!("Final {}", best_state.format_score_breakdown());
        }

        best_state.validate_scores();
        let result = best_state.to_solver_result_with_metadata(
            final_cost,
            no_improvement_counter,
            Some(stop_reason),
            Some(benchmark_telemetry.clone()),
        );

        if state.logging.display_final_schedule {
            println!("{}", result.display());
        }

        // Calculate algorithm metrics for potential logging (metrics are available in progress callbacks)
        let _metrics_result = metrics.calculate_metrics(elapsed);
        // Algorithm metrics are now available through the progress callback system

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        cooling_progress_since_reheat, select_clique_source_group, temperature_for_cooling_progress,
    };
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition,
        SimulatedAnnealingParams, SolverConfiguration, SolverParams, StopConditions,
    };
    use crate::solver1::State;
    use std::collections::HashMap;

    fn person(id: &str) -> Person {
        Person {
            id: id.to_string(),
            attributes: HashMap::new(),
            sessions: None,
        }
    }

    fn deterministic_solver_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(1),
                time_limit_seconds: None,
                no_improvement_iterations: Some(0),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 10.0,
                final_temperature: 0.1,
                cooling_schedule: "geometric".to_string(),
                reheat_after_no_improvement: Some(0),
                reheat_cycles: Some(0),
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(17),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    #[test]
    fn runtime_budget_progress_can_be_driven_by_elapsed_time() {
        let progress = cooling_progress_since_reheat(50, 10_000, 2.7, Some(3.0));
        assert!(
            progress > 0.85,
            "expected time progress to dominate, got {progress}"
        );

        let temperature = temperature_for_cooling_progress(10.0, 0.1, progress);
        assert!(
            temperature < 0.25,
            "expected near-final temperature, got {temperature}"
        );
    }

    #[test]
    fn clique_source_group_prefers_lowest_group_on_tie() {
        let input = ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
            problem: ProblemDefinition {
                people: vec![person("p0"), person("p1"), person("p2"), person("p3")],
                groups: vec![
                    Group {
                        id: "g0".to_string(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".to_string(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 1,
            },
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![Constraint::MustStayTogether {
                people: vec!["p0".to_string(), "p1".to_string()],
                sessions: None,
            }],
            solver: deterministic_solver_config(),
        };

        let mut state = State::new(&input).expect("state should build");
        let p0 = state.person_id_to_idx["p0"];
        let p1 = state.person_id_to_idx["p1"];
        let p2 = state.person_id_to_idx["p2"];
        let p3 = state.person_id_to_idx["p3"];

        state.schedule[0][0] = vec![p0, p2];
        state.schedule[0][1] = vec![p1, p3];
        state.locations[0][p0] = (0, 0);
        state.locations[0][p2] = (0, 1);
        state.locations[0][p1] = (1, 0);
        state.locations[0][p3] = (1, 1);

        let clique = &state.cliques[0];
        assert_eq!(select_clique_source_group(&state, clique, 0), Some(0));
    }
}
