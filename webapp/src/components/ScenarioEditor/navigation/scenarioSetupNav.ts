import { BarChart3, Calendar, Hash, Lock, Tag, Users, Zap } from 'lucide-react';
import type {
  ScenarioSetupCountContext,
  ScenarioSetupNavSurface,
  ScenarioSetupSectionDefinition,
  ScenarioSetupSectionGroupDefinition,
  ScenarioSetupSectionId,
} from './scenarioSetupNavTypes';

export interface ScenarioSetupResolvedSection extends ScenarioSetupSectionDefinition {
  resolvedCount?: number;
}

const HARD_CONSTRAINT_TYPES = new Set(['ImmovablePeople', 'MustStayTogether']);
const SOFT_CONSTRAINT_TYPES = new Set([
  'RepeatEncounter',
  'AttributeBalance',
  'ShouldNotBeTogether',
  'ShouldStayTogether',
  'PairMeetingCount',
]);

export const PROBLEM_SETUP_SECTION_GROUPS: readonly ScenarioSetupSectionGroupDefinition[] = [
  {
    id: 'model',
    label: 'Model',
    order: 1,
    description: 'Define the structure and entities that make up the scenario.',
  },
  {
    id: 'rules',
    label: 'Rules',
    order: 2,
    description: 'Add hard and soft constraints that shape valid and desirable solutions.',
  },
  {
    id: 'goals',
    label: 'Goals',
    order: 3,
    description: 'Configure optimization priorities once the model and rules are defined.',
  },
] as const;

export const PROBLEM_SETUP_SECTIONS: readonly ScenarioSetupSectionDefinition[] = [
  {
    id: 'sessions',
    routeSegment: 'sessions',
    label: 'Sessions',
    description: 'Define how many sessions the optimization should schedule.',
    group: 'model',
    order: 1,
    icon: Calendar,
    status: 'available',
    surfaces: ['legacy-tabs', 'sidebar'],
    count: ({ scenario }) => scenario?.num_sessions ?? 0,
  },
  {
    id: 'groups',
    routeSegment: 'groups',
    label: 'Groups',
    description: 'Define the available groups and capacities participants can be assigned to.',
    group: 'model',
    order: 2,
    icon: Hash,
    status: 'available',
    surfaces: ['legacy-tabs', 'sidebar'],
    count: ({ scenario }) => scenario?.groups.length ?? 0,
  },
  {
    id: 'attributes',
    routeSegment: 'attributes',
    label: 'Attribute Definitions',
    shortLabel: 'Attributes',
    description: 'Define the attribute schema that people and attribute-based constraints can reference.',
    group: 'model',
    order: 3,
    icon: Tag,
    status: 'available',
    surfaces: ['sidebar'],
    count: ({ attributeDefinitions }) => attributeDefinitions.length,
  },
  {
    id: 'people',
    routeSegment: 'people',
    label: 'People',
    description: 'Define the participants, their availability, and their attribute values.',
    group: 'model',
    order: 4,
    icon: Users,
    status: 'available',
    surfaces: ['legacy-tabs', 'sidebar'],
    count: ({ scenario }) => scenario?.people.length ?? 0,
  },
  {
    id: 'hard',
    routeSegment: 'hard',
    label: 'Hard Constraints',
    description: 'Add rules that must never be violated by the final solution.',
    group: 'rules',
    order: 5,
    icon: Lock,
    status: 'available',
    surfaces: ['legacy-tabs', 'sidebar'],
    hasLocalSubnavigation: true,
    count: ({ scenario }) => scenario?.constraints.filter((constraint) => HARD_CONSTRAINT_TYPES.has(String(constraint.type))).length ?? 0,
  },
  {
    id: 'soft',
    routeSegment: 'soft',
    label: 'Soft Constraints',
    description: 'Add weighted preferences that improve solution quality without making schedules infeasible.',
    group: 'rules',
    order: 6,
    icon: Zap,
    status: 'available',
    surfaces: ['legacy-tabs', 'sidebar'],
    hasLocalSubnavigation: true,
    count: ({ scenario }) => scenario?.constraints.filter((constraint) => SOFT_CONSTRAINT_TYPES.has(String(constraint.type))).length ?? 0,
  },
  {
    id: 'objectives',
    routeSegment: 'objectives',
    label: 'Objectives',
    description: 'Tune optimization goals once the model and rules are in place.',
    group: 'goals',
    order: 7,
    icon: BarChart3,
    status: 'available',
    surfaces: ['legacy-tabs', 'sidebar'],
    count: ({ objectiveCount }) => objectiveCount,
  },
] as const;

export function getScenarioSetupSectionCount(
  section: ScenarioSetupSectionDefinition,
  context: ScenarioSetupCountContext,
): number | undefined {
  return section.count?.(context);
}

export function getScenarioSetupSections(options?: {
  surface?: ScenarioSetupNavSurface;
  includePlanned?: boolean;
}): ScenarioSetupSectionDefinition[] {
  const { surface, includePlanned = false } = options ?? {};

  return PROBLEM_SETUP_SECTIONS
    .filter((section) => (includePlanned ? true : section.status === 'available'))
    .filter((section) => (surface ? section.surfaces.includes(surface) : true))
    .slice()
    .sort((left, right) => left.order - right.order);
}

export function getScenarioSetupSectionGroups(): ScenarioSetupSectionGroupDefinition[] {
  return PROBLEM_SETUP_SECTION_GROUPS.slice().sort((left, right) => left.order - right.order);
}

export function getScenarioSetupSectionById(sectionId: string): ScenarioSetupSectionDefinition | undefined {
  return PROBLEM_SETUP_SECTIONS.find((section) => section.id === sectionId);
}

export function isScenarioSetupSectionId(value: string): value is ScenarioSetupSectionId {
  return PROBLEM_SETUP_SECTIONS.some((section) => section.id === value);
}

export function getScenarioSetupSectionsByGroup(options?: {
  surface?: ScenarioSetupNavSurface;
  includePlanned?: boolean;
}): Array<{ group: ScenarioSetupSectionGroupDefinition; sections: ScenarioSetupSectionDefinition[] }> {
  const sections = getScenarioSetupSections(options);

  return getScenarioSetupSectionGroups()
    .map((group) => ({
      group,
      sections: sections.filter((section) => section.group === group.id),
    }))
    .filter((entry) => entry.sections.length > 0);
}

export function getResolvedScenarioSetupSectionsByGroup(
  context: ScenarioSetupCountContext,
  options?: {
    surface?: ScenarioSetupNavSurface;
    includePlanned?: boolean;
  },
): Array<{ group: ScenarioSetupSectionGroupDefinition; sections: ScenarioSetupResolvedSection[] }> {
  return getScenarioSetupSectionsByGroup(options).map((entry) => ({
    group: entry.group,
    sections: entry.sections.map((section) => ({
      ...section,
      resolvedCount: getScenarioSetupSectionCount(section, context),
    })),
  }));
}
