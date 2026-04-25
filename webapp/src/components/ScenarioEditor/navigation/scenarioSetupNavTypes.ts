import type { LucideIcon } from 'lucide-react';
import type { AttributeDefinition, Scenario } from '../../../types';

export type ScenarioSetupSectionGroupId = 'model' | 'requirements' | 'preferences' | 'optimization';

export type ScenarioSetupSectionId =
  | 'sessions'
  | 'groups'
  | 'attributes'
  | 'people'
  | 'immovable-people'
  | 'must-stay-together'
  | 'must-stay-apart'
  | 'repeat-encounter'
  | 'should-not-be-together'
  | 'should-stay-together'
  | 'attribute-balance'
  | 'pair-meeting-count'
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
  tooltipDescription?: string;
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
