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
  | "no_improvement_time_limit_reached"
  | "progress_callback_requested_stop"
  | "optimal_score_reached";

export type AutoConstructorOutcome =
  | "initial_schedule"
  | "success"
  | "timeout"
  | "validation_error"
  | "unsupported"
  | "fallback_baseline";

export interface AutoSolveTelemetry {
  selected_solver: string;
  complexity_model_version: string;
  complexity_score: number;
  total_budget_seconds: number;
  oracle_construction_budget_seconds: number;
  scaffold_budget_seconds: number;
  oracle_recombination_budget_seconds: number;
  search_budget_seconds: number;
  constructor_attempt: string;
  constructor_outcome: AutoConstructorOutcome;
  constructor_fallback_used: boolean;
  constructor_failure?: string | null;
  constructor_wall_seconds: number;
}

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
  auto?: AutoSolveTelemetry | null;
  moves: MoveFamilyBenchmarkTelemetrySummary;
}

// Progress update interface matching the Rust ProgressUpdate struct
export interface ProgressUpdate {
  iteration: number;
  max_iterations: number;
  temperature: number;
  current_score: number;
  best_score: number;
  current_contacts: number;
  best_contacts: number;
  repetition_penalty: number;
  elapsed_seconds: number;
  no_improvement_count: number;

  clique_swaps_tried: number;
  clique_swaps_accepted: number;
  clique_swaps_rejected: number;
  transfers_tried: number;
  transfers_accepted: number;
  transfers_rejected: number;
  swaps_tried: number;
  swaps_accepted: number;
  swaps_rejected: number;

  overall_acceptance_rate: number;
  recent_acceptance_rate: number;
  avg_attempted_move_delta: number;
  avg_accepted_move_delta: number;
  biggest_accepted_increase: number;
  biggest_attempted_increase: number;

  current_repetition_penalty: number;
  current_balance_penalty: number;
  current_constraint_penalty: number;
  best_repetition_penalty: number;
  best_balance_penalty: number;
  best_constraint_penalty: number;

  reheats_performed: number;
  iterations_since_last_reheat: number;
  local_optima_escapes: number;
  avg_time_per_iteration_ms: number;
  cooling_progress: number;

  clique_swap_success_rate: number;
  transfer_success_rate: number;
  swap_success_rate: number;

  score_variance: number;
  search_efficiency: number;
  best_schedule?: WasmRecordLike<WasmRecordLike<string[]>>;
  effective_seed?: number;
  move_policy?: MovePolicy;
  stop_reason?: StopReason;
}

export type ProgressCallback = (progress: ProgressUpdate) => void;

export type WasmRecordLike<T> = Record<string, T> | Map<string, T>;

export interface RustResult {
  schedule: WasmRecordLike<WasmRecordLike<string[]>>;
  final_score: number;
  unique_contacts: number;
  repetition_penalty: number;
  attribute_balance_penalty: number;
  constraint_penalty: number;
  weighted_repetition_penalty: number;
  weighted_constraint_penalty: number;
  effective_seed?: number;
  move_policy?: MovePolicy;
  stop_reason?: StopReason;
  benchmark_telemetry?: SolverBenchmarkTelemetry;
}
