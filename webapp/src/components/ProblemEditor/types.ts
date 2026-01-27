/**
 * ProblemEditor-specific types.
 */

import type { Person, Group, Constraint, AttributeDefinition, PersonFormData, GroupFormData } from '../../types';

// Type for demo case with metrics - matches export from demoDataService
export interface DemoCaseWithMetrics {
  id: string;
  name: string;
  description: string;
  category: "Simple" | "Intermediate" | "Advanced" | "Benchmark";
  filename: string;
  peopleCount: number;
  groupCount: number;
  sessionCount: number;
}

// Constraint type for the dashboard
export interface AttributeBalanceConstraint {
  type: 'AttributeBalance';
  group_id: string;
  attribute_key: string;
  desired_values: Record<string, number>;
  penalty_weight: number;
  sessions?: number[];
}

// Constraint form state
export interface ConstraintFormState {
  type: Constraint['type'];
  // RepeatEncounter
  max_allowed_encounters?: number;
  penalty_function?: 'linear' | 'squared';
  penalty_weight?: number;
  // AttributeBalance
  group_id?: string;
  attribute_key?: string;
  desired_values?: Record<string, number>;
  // ImmovablePerson
  person_id?: string;
  // MustStayTogether / ShouldNotBeTogether
  people?: string[];
  sessions?: number[];
}

// View mode for people list
export type PeopleViewMode = 'grid' | 'list';

// Sort options for people
export type PeopleSortBy = 'name' | 'sessions';
export type SortOrder = 'asc' | 'desc';

// Constraint category
export type ConstraintCategory = 'soft' | 'hard';

// Re-export common types for convenience
export type { Person, Group, Constraint, AttributeDefinition, PersonFormData, GroupFormData };
