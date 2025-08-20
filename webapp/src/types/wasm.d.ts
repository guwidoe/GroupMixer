declare module "virtual:wasm-solver" {
  export function solve(problem_json: string): string;
  export function solve_with_progress(
    problem_json: string,
    callback?: (progress_json: string) => boolean
  ): string;
  export function validate_problem(problem_json: string): string;
  export function get_default_settings(): string;
  export function evaluate_input(input_json: string): string;
  export function init_panic_hook(): void;
  export default function init(
    module_or_path?: string | URL | Request
  ): Promise<void>;
}

export type WasmModule = {
  solve: (problem_json: string) => string;
  solve_with_progress: (
    problem_json: string,
    callback?: (progress_json: string) => boolean
  ) => string;
  validate_problem: (problem_json: string) => string;
  get_default_settings: () => string;
  evaluate_input?: (input_json: string) => string;
  init_panic_hook: () => void;
  default: () => Promise<void>;
};

export interface Problem {
  people: { name: string; id: string }[];
  tables: { name: string; capacity: number; id: string }[];
  groups: { name: string; person_ids: string[]; id: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constraints: { type: string; value: any }[];
}

export interface Assignment {
  person_id: string;
  table_id: string;
}

export interface Solution {
  assignments: Assignment[];
  unassigned_person_ids: string[];
  score: number;
  score_breakdown: Record<string, number>;
  contacts: number;
  repetition_penalty: number;
  iteration: number;
  temperature: number;
  max_iterations: number;
  no_improvement_count: number;
}

export interface SolverSettings {
  // Define SolverSettings structure - can be fleshed out later if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
