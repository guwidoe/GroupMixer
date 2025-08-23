// Core data structures matching the Rust solver-core backend exactly
export interface Person {
  id: string;
  attributes: Record<string, string>; // Key-value attributes (e.g., {"gender": "female", "department": "engineering"})
  sessions?: number[]; // Optional: specific sessions this person participates in (0-based indices)
}

export interface Group {
  id: string;
  size: number; // Fixed capacity - maximum number of people in this group per session
}

// Constraint types matching solver-core exactly
export interface RepeatEncounterParams {
  max_allowed_encounters: number;
  penalty_function: "linear" | "squared";
  penalty_weight: number;
}

export interface AttributeBalanceParams {
  group_id: string;
  attribute_key: string;
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

// Constraint union type matching solver-core's tagged enum structure
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

export interface Problem {
  people: Person[];
  groups: Group[];
  num_sessions: number; // Renamed from sessions_count to match solver-core
  /**
   * Optimization objectives to be maximized by the solver. If omitted or empty, the frontend will automatically inject a default
   * "maximize_unique_contacts" objective with weight 1.0 when sending the problem to the solver.
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
  // Optional list of 0-based session indices the solver may modify.
  // If omitted, all sessions are eligible for moves.
  allowed_sessions?: number[];
}

export interface StopConditions {
  max_iterations?: number;
  time_limit_seconds?: number;
  no_improvement_iterations?: number;
}

export interface SolverParams {
  SimulatedAnnealing?: SimulatedAnnealingParams;
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

// Problem Management types

// Snapshot of problem configuration when result was created
export interface ProblemSnapshot {
  people: Person[];
  groups: Group[];
  num_sessions: number;
  objectives?: Objective[];
  constraints: Constraint[];
  // Note: settings are already stored separately in ProblemResult.solverSettings
}

export interface ProblemResult {
  id: string;
  name?: string; // Custom name or auto-generated
  solution: Solution;
  solverSettings: SolverSettings;
  problemSnapshot?: ProblemSnapshot; // Optional for backwards compatibility
  timestamp: number; // Unix timestamp when result was created
  duration: number; // Actual solve time in milliseconds
}

export interface SavedProblem {
  id: string;
  name: string;
  problem: Problem;
  results: ProblemResult[];
  createdAt: number;
  updatedAt: number;
  isTemplate?: boolean; // Mark as template for easy duplication
}

export interface ProblemSummary {
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
  problem: Problem | null;
  solution: Solution | null;
  solverState: SolverState;
  attributeDefinitions: AttributeDefinition[];

  // Problem Management
  currentProblemId: string | null;
  savedProblems: Record<string, SavedProblem>; // Keyed by problem ID
  selectedResultIds: string[]; // For comparison

  // Demo data dropdown state
  demoDropdownOpen: boolean;

  ui: {
    activeTab: "problem" | "solver" | "results" | "manage";
    isLoading: boolean;
    notifications: Notification[];
    showProblemManager: boolean;
    showResultComparison: boolean;
    warmStartResultId?: string | null;
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
}

export interface AttributeDefinition {
  key: string;
  values: string[]; // Possible values for this attribute
}

// Export/Import types
export interface ExportedProblem {
  version: string; // For future compatibility
  problem: SavedProblem;
  attributeDefinitions?: AttributeDefinition[];
  exportedAt: number;
}

// WASM Module types
export interface WasmModule {
  solve: (problem_json: string) => string;
  solve_with_progress: (
    problem_json: string,
    progress_callback?: (progress_json: string) => boolean
  ) => string;
  validate_problem: (problem_json: string) => string;
  get_default_settings: () => string;
}
