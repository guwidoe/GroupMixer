import type { ProgressUpdate } from '../services/wasm/types';

// Core data structures matching the Rust gm-core backend exactly
export interface Person {
  id: string;
  attributes: Record<string, string>; // Key-value attributes (e.g., {"gender": "female", "department": "engineering"})
  attributeValues?: Record<string, string>; // Scenario-local relational attribute assignments keyed by AttributeDefinition.id
  sessions?: number[]; // Optional: specific sessions this person participates in (0-based indices)
}

export interface Group {
  id: string;
  size: number; // Default capacity - maximum number of people in this group per session when no override is present
  session_sizes?: number[]; // Optional per-session capacities overriding `size` by session index
}

// Constraint types matching gm-core exactly
export interface RepeatEncounterParams {
  max_allowed_encounters: number;
  penalty_function: "linear" | "squared";
  penalty_weight: number;
}

export interface AttributeBalanceParams {
  group_id: string;
  attribute_key: string;
  attribute_id?: string;
  desired_values: Record<string, number>; // e.g., {"male": 2, "female": 2}
  penalty_weight: number;
  /**
   * How to interpret desired counts. If omitted, defaults to "exact" to match backend default.
   * - "exact": penalize deviation in either direction
   * - "at_least": penalize only shortfalls
   */
  mode?: "exact" | "at_least";
  sessions?: number[]; // Optional: if undefined, applies to all sessions
}

export interface ImmovablePersonParams {
  person_id: string;
  group_id: string;
  sessions: number[]; // Sessions where this person must be in this group
}

// Add new multi-person immovable constraint params
export interface ImmovablePeopleParams {
  people: string[];
  group_id: string;
  sessions: number[];
}

// Constraint union type matching gm-core's tagged enum structure
export type Constraint =
  | ({ type: "RepeatEncounter" } & RepeatEncounterParams)
  | ({ type: "AttributeBalance" } & AttributeBalanceParams)
  | ({ type: "ImmovablePerson" } & ImmovablePersonParams)
  | ({ type: "ImmovablePeople" } & ImmovablePeopleParams)
  | {
      type: "MustStayTogether";
      people: string[];
      sessions?: number[]; // Optional: if undefined, applies to all sessions
    }
  | {
      type: "ShouldStayTogether";
      people: string[];
      penalty_weight: number;
      sessions?: number[]; // Optional: if undefined, applies to all sessions
    }
  | {
      type: "ShouldNotBeTogether";
      people: string[];
      penalty_weight: number;
      sessions?: number[]; // Optional: if undefined, applies to all sessions
    }
  | {
      type: "PairMeetingCount";
      people: [string, string];
      sessions: number[]; // fixed subset to consider
      target_meetings: number; // 0..sessions.length
      mode?: "at_least" | "exact" | "at_most"; // default at_least
      penalty_weight: number; // linear per unit deviation based on mode
    };

export interface Objective {
  type: string; // e.g., "maximize_unique_contacts"
  weight: number; // Relative importance of the objective
}

export interface Scenario {
  people: Person[];
  groups: Group[];
  num_sessions: number; // Renamed from sessions_count to match gm-core
  /**
   * Optimization objectives to be maximized by the solver. If omitted or empty, the frontend will automatically inject a default
   * "maximize_unique_contacts" objective with weight 1.0 when sending the scenario to the solver.
   */
  objectives?: Objective[];
  constraints: Constraint[];
  settings: SolverSettings;
}

export interface SolverSettings {
  solver_type: string;
  stop_conditions: StopConditions;
  solver_params: SolverParams;
  logging?: LoggingOptions;
  telemetry?: {
    emit_best_schedule?: boolean;
    best_schedule_every_n_callbacks?: number;
  };
  seed?: number;
  move_policy?: MovePolicy;
  // Optional list of 0-based session indices the solver may modify.
  // If omitted, all sessions are eligible for moves.
  allowed_sessions?: number[];
}

export type MoveFamily = "swap" | "transfer" | "clique_swap";

export type MoveSelectionMode = "adaptive" | "weighted";

export interface MoveFamilyWeights {
  swap: number;
  transfer: number;
  clique_swap: number;
}

export interface MovePolicy {
  mode?: MoveSelectionMode;
  allowed_families?: MoveFamily[];
  forced_family?: MoveFamily;
  weights?: MoveFamilyWeights;
}

export type StopReason =
  | "max_iterations_reached"
  | "time_limit_reached"
  | "no_improvement_limit_reached"
  | "progress_callback_requested_stop"
  | "optimal_score_reached";

export interface MoveFamilyBenchmarkTelemetry {
  attempts: number;
  accepted: number;
  rejected: number;
  preview_seconds: number;
  apply_seconds: number;
  full_recalculation_count: number;
  full_recalculation_seconds: number;
}

export interface MoveFamilyBenchmarkTelemetrySummary {
  swap: MoveFamilyBenchmarkTelemetry;
  transfer: MoveFamilyBenchmarkTelemetry;
  clique_swap: MoveFamilyBenchmarkTelemetry;
}

export interface SolverBenchmarkTelemetry {
  effective_seed: number;
  move_policy: MovePolicy;
  stop_reason: StopReason;
  iterations_completed: number;
  no_improvement_count: number;
  reheats_performed: number;
  initial_score: number;
  best_score: number;
  final_score: number;
  initialization_seconds: number;
  search_seconds: number;
  finalization_seconds: number;
  total_seconds: number;
  moves: MoveFamilyBenchmarkTelemetrySummary;
}

export interface StopConditions {
  max_iterations?: number;
  time_limit_seconds?: number;
  no_improvement_iterations?: number;
  stop_on_optimal_score?: boolean;
}

export interface SolverParams {
  SimulatedAnnealing?: SimulatedAnnealingParams;
  solver2?: Solver2Params;
  solver3?: Solver3Params;
  solver_type?: 'SimulatedAnnealing' | 'solver2' | 'solver3' | string;
  initial_temperature?: number;
  final_temperature?: number;
  cooling_schedule?: 'geometric' | 'linear' | string;
  reheat_cycles?: number;
  reheat_after_no_improvement?: number;
  correctness_lane?: Solver3CorrectnessLaneParams;
}

export type Solver2Params = Record<string, never>;

// Webapp-facing solver3 settings intentionally expose only the production/default surface.
// Research-only search drivers and hotspot/recombination controls stay behind Rust compile-time
// features and are not part of the normal webapp configuration contract.
export interface Solver3Params {
  correctness_lane?: Solver3CorrectnessLaneParams;
}

export interface Solver3CorrectnessLaneParams {
  enabled: boolean;
  sample_every_accepted_moves: number;
}

export interface SimulatedAnnealingParams {
  initial_temperature: number;
  final_temperature: number;
  cooling_schedule: "geometric" | "linear";
  reheat_cycles?: number; // Optional: number of fixed cycles across total iterations (0/undefined = disabled)
  reheat_after_no_improvement?: number; // Optional: number of iterations without improvement before reheating (0 = disabled)
}

export interface LoggingOptions {
  log_frequency?: number;
  log_initial_state?: boolean;
  log_duration_and_score?: boolean;
  display_final_schedule?: boolean;
  log_initial_score_breakdown?: boolean;
  log_final_score_breakdown?: boolean;
  log_stop_condition?: boolean;
  // Debug options (expensive – use only when diagnosing issues)
  debug_validate_invariants?: boolean;
  debug_dump_invariant_context?: boolean;
}

export interface Solution {
  assignments: Assignment[];
  final_score: number;
  unique_contacts: number;
  repetition_penalty: number;
  attribute_balance_penalty: number;
  constraint_penalty: number;
  iteration_count: number;
  elapsed_time_ms: number;
  // Weighted penalty values (actual values used in cost calculation)
  // Optional for backward compatibility with existing saved results
  weighted_repetition_penalty?: number;
  weighted_constraint_penalty?: number;
  effective_seed?: number;
  move_policy?: MovePolicy;
  stop_reason?: StopReason;
  benchmark_telemetry?: SolverBenchmarkTelemetry;
}

export interface Assignment {
  person_id: string;
  group_id: string;
  session_id: number;
}

export interface SolverState {
  isRunning: boolean;
  isComplete: boolean;
  currentIteration: number;
  bestScore: number;
  currentScore?: number;
  elapsedTime: number;
  noImprovementCount: number;
  error?: string;
  latestProgress?: ProgressUpdate | null;
  latestSolution?: Solution | null;

  // === Live Algorithm Metrics ===
  // Temperature and progress
  temperature?: number;
  coolingProgress?: number;

  // Move type statistics
  cliqueSwapsTried?: number;
  cliqueSwapsAccepted?: number;
  transfersTried?: number;
  transfersAccepted?: number;
  swapsTried?: number;
  swapsAccepted?: number;

  // Acceptance rates
  overallAcceptanceRate?: number;
  recentAcceptanceRate?: number;

  // Move quality metrics
  avgAttemptedMoveDelta?: number;
  avgAcceptedMoveDelta?: number;
  biggestAcceptedIncrease?: number;
  biggestAttemptedIncrease?: number;

  // Score breakdown
  currentRepetitionPenalty?: number;
  currentBalancePenalty?: number;
  currentConstraintPenalty?: number;
  initialConstraintPenalty?: number;
  bestRepetitionPenalty?: number;
  bestBalancePenalty?: number;
  bestConstraintPenalty?: number;

  // Algorithm behavior
  reheatsPerformed?: number;
  iterationsSinceLastReheat?: number;
  localOptimaEscapes?: number;
  avgTimePerIterationMs?: number;

  // Success rates by move type
  cliqueSwapSuccessRate?: number;
  transferSuccessRate?: number;
  swapSuccessRate?: number;

  // Advanced analytics
  scoreVariance?: number;
  searchEfficiency?: number;
}

// Scenario Management types

// Snapshot of scenario configuration when result was created
export interface ScenarioSnapshot {
  people: Person[];
  groups: Group[];
  num_sessions: number;
  objectives?: Objective[];
  constraints: Constraint[];
  // Note: settings are already stored separately in ScenarioResult.solverSettings
}

export interface ScenarioResult {
  id: string;
  name?: string; // Custom name or auto-generated
  solution: Solution;
  solverSettings: SolverSettings;
  scenarioSnapshot?: ScenarioSnapshot; // Optional for backwards compatibility
  timestamp: number; // Unix timestamp when result was created
  duration: number; // Actual solve time in milliseconds
}

export interface SavedScenario {
  id: string;
  name: string;
  scenario: Scenario;
  attributeDefinitions: AttributeDefinition[];
  results: ScenarioResult[];
  createdAt: number;
  updatedAt: number;
  isTemplate?: boolean; // Mark as template for easy duplication
}

export interface ScenarioSummary {
  id: string;
  name: string;
  peopleCount: number;
  groupsCount: number;
  sessionsCount: number;
  resultsCount: number;
  createdAt: number;
  updatedAt: number;
  isTemplate?: boolean;
}

// UI State types
export interface AppState {
  scenario: Scenario | null;
  solution: Solution | null;
  solverState: SolverState;
  attributeDefinitions: AttributeDefinition[];

  // Scenario Management
  currentScenarioId: string | null;
  currentResultId: string | null;
  savedScenarios: Record<string, SavedScenario>; // Keyed by scenario ID
  selectedResultIds: string[]; // For comparison

  // Demo data dropdown state
  demoDropdownOpen: boolean;

  ui: {
    activeTab: "scenario" | "solver" | "results" | "manage";
    isLoading: boolean;
    notifications: Notification[];
    showScenarioManager: boolean;
    showResultComparison: boolean;
    warmStartResultId?: string | null;
    lastScenarioSetupSection?: string | null;
  };
}

export interface Notification {
  id: string;
  type: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  duration?: number; // Auto-dismiss after X ms
}

// Form types for UI
export interface PersonFormData {
  id?: string;
  attributes: Record<string, string>;
  sessions: number[]; // Empty array means all sessions
}

export interface GroupFormData {
  id?: string;
  size: number;
  session_sizes?: number[];
}

export interface AttributeDefinition {
  id: string;
  name: string;
  key?: string; // Legacy alias retained for migration/compatibility during the schema transition
  values: string[]; // Possible values for this attribute
}

// Export/Import types
export interface ExportedScenario {
  version: string; // For future compatibility
  scenario: SavedScenario;
  attributeDefinitions?: AttributeDefinition[]; // Legacy export field; authoritative definitions now live on SavedScenario
  exportedAt: number;
}
