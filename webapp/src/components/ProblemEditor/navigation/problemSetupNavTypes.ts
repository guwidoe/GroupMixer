import type { LucideIcon } from 'lucide-react';
import type { AttributeDefinition, Problem } from '../../../types';

export type ProblemSetupSectionGroupId = 'model' | 'rules' | 'goals';

export type ProblemSetupSectionId =
  | 'sessions'
  | 'groups'
  | 'attributes'
  | 'people'
  | 'hard'
  | 'soft'
  | 'objectives';

export type ProblemSetupNavSurface = 'legacy-tabs' | 'sidebar';

export type ProblemSetupSectionStatus = 'available' | 'planned';

export interface ProblemSetupCountContext {
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  objectiveCount: number;
}

export interface ProblemSetupSectionDefinition {
  id: ProblemSetupSectionId;
  routeSegment: ProblemSetupSectionId;
  label: string;
  shortLabel?: string;
  description: string;
  group: ProblemSetupSectionGroupId;
  order: number;
  icon: LucideIcon;
  status: ProblemSetupSectionStatus;
  surfaces: ProblemSetupNavSurface[];
  hasLocalSubnavigation?: boolean;
  count?: (context: ProblemSetupCountContext) => number | undefined;
}

export interface ProblemSetupSectionGroupDefinition {
  id: ProblemSetupSectionGroupId;
  label: string;
  order: number;
  description: string;
}
