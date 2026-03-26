import type { LucideIcon } from 'lucide-react';
import type { AttributeDefinition, Scenario } from '../../../types';

export type ScenarioSetupSectionGroupId = 'model' | 'rules' | 'goals';

export type ScenarioSetupSectionId =
  | 'sessions'
  | 'groups'
  | 'attributes'
  | 'people'
  | 'hard'
  | 'soft'
  | 'objectives';

export type ScenarioSetupNavSurface = 'legacy-tabs' | 'sidebar';

export type ScenarioSetupSectionStatus = 'available' | 'planned';

export interface ScenarioSetupCountContext {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  objectiveCount: number;
}

export interface ScenarioSetupSectionDefinition {
  id: ScenarioSetupSectionId;
  routeSegment: ScenarioSetupSectionId;
  label: string;
  shortLabel?: string;
  description: string;
  group: ScenarioSetupSectionGroupId;
  order: number;
  icon: LucideIcon;
  status: ScenarioSetupSectionStatus;
  surfaces: ScenarioSetupNavSurface[];
  hasLocalSubnavigation?: boolean;
  count?: (context: ScenarioSetupCountContext) => number | undefined;
}

export interface ScenarioSetupSectionGroupDefinition {
  id: ScenarioSetupSectionGroupId;
  label: string;
  order: number;
  description: string;
}
