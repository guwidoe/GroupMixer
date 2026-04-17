import {
  BarChart3,
  Calendar,
  Hash,
  Link2,
  Lock,
  Scale,
  Tag,
  UserLock,
  UserMinus,
  Users,
  UserX,
  Zap,
} from 'lucide-react';
import { getConstraintDisplayName, getConstraintTooltipDescription } from '../../../utils/constraintDisplay';
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

const LEGACY_ROUTE_REDIRECTS: Record<string, ScenarioSetupSectionId> = {
  hard: 'immovable-people',
  soft: 'repeat-encounter',
  constraints: 'repeat-encounter',
};

function countConstraintsByType(context: ScenarioSetupCountContext, type: string): number | undefined {
  if (!context.scenario) {
    return undefined;
  }

  return context.scenario.constraints.filter((constraint) => String(constraint.type) === type).length;
}

export const PROBLEM_SETUP_SECTION_GROUPS: readonly ScenarioSetupSectionGroupDefinition[] = [
  {
    id: 'model',
    label: 'Model',
    order: 1,
    description: 'Define the structure and entities that make up the scenario.',
  },
  {
    id: 'requirements',
    label: 'Requirements',
    order: 2,
    description: 'Add constraints that the final schedule must satisfy.',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    order: 3,
    description: 'Add weighted preferences that guide the solver toward better schedules.',
  },
  {
    id: 'optimization',
    label: 'Optimization',
    order: 4,
    description: 'Tune optimization priorities once the model and constraints are defined.',
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
    count: ({ scenario }) => (scenario ? scenario.num_sessions : undefined),
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
    count: ({ scenario }) => (scenario ? scenario.groups.length : undefined),
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
    count: ({ scenario, attributeDefinitions }) => (scenario ? attributeDefinitions.length : undefined),
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
    count: ({ scenario }) => (scenario ? scenario.people.length : undefined),
  },
  {
    id: 'immovable-people',
    routeSegment: 'immovable-people',
    label: getConstraintDisplayName('ImmovablePeople'),
    shortLabel: getConstraintDisplayName('ImmovablePeople'),
    tooltipDescription: getConstraintTooltipDescription('ImmovablePeople'),
    description: 'Fix selected people to a specific group in the chosen sessions.',
    group: 'requirements',
    order: 5,
    icon: UserLock,
    status: 'available',
    surfaces: ['sidebar'],
    count: (context) => countConstraintsByType(context, 'ImmovablePeople'),
  },
  {
    id: 'must-stay-together',
    routeSegment: 'must-stay-together',
    label: getConstraintDisplayName('MustStayTogether'),
    shortLabel: getConstraintDisplayName('MustStayTogether'),
    tooltipDescription: getConstraintTooltipDescription('MustStayTogether'),
    description: 'Require selected people to remain in the same group.',
    group: 'requirements',
    order: 6,
    icon: Lock,
    status: 'available',
    surfaces: ['sidebar'],
    count: (context) => countConstraintsByType(context, 'MustStayTogether'),
  },
  {
    id: 'must-stay-apart',
    routeSegment: 'must-stay-apart',
    label: getConstraintDisplayName('MustStayApart'),
    shortLabel: getConstraintDisplayName('MustStayApart'),
    tooltipDescription: getConstraintTooltipDescription('MustStayApart'),
    description: 'Require selected people to remain in different groups.',
    group: 'requirements',
    order: 7,
    icon: UserMinus,
    status: 'available',
    surfaces: ['sidebar'],
    count: (context) => countConstraintsByType(context, 'MustStayApart'),
  },
  {
    id: 'repeat-encounter',
    routeSegment: 'repeat-encounter',
    label: getConstraintDisplayName('RepeatEncounter'),
    shortLabel: getConstraintDisplayName('RepeatEncounter'),
    tooltipDescription: getConstraintTooltipDescription('RepeatEncounter'),
    description: 'Limit how often the same people can meet across sessions.',
    group: 'preferences',
    order: 8,
    icon: Zap,
    status: 'available',
    surfaces: ['sidebar'],
    count: (context) => countConstraintsByType(context, 'RepeatEncounter'),
  },
  {
    id: 'should-not-be-together',
    routeSegment: 'should-not-be-together',
    label: getConstraintDisplayName('ShouldNotBeTogether'),
    shortLabel: getConstraintDisplayName('ShouldNotBeTogether'),
    tooltipDescription: getConstraintTooltipDescription('ShouldNotBeTogether'),
    description: 'Discourage selected people from ending up in the same group.',
    group: 'preferences',
    order: 9,
    icon: UserX,
    status: 'available',
    surfaces: ['sidebar'],
    count: (context) => countConstraintsByType(context, 'ShouldNotBeTogether'),
  },
  {
    id: 'should-stay-together',
    routeSegment: 'should-stay-together',
    label: getConstraintDisplayName('ShouldStayTogether'),
    shortLabel: getConstraintDisplayName('ShouldStayTogether'),
    tooltipDescription: getConstraintTooltipDescription('ShouldStayTogether'),
    description: 'Prefer selected people to stay together without making it mandatory.',
    group: 'preferences',
    order: 10,
    icon: Link2,
    status: 'available',
    surfaces: ['sidebar'],
    count: (context) => countConstraintsByType(context, 'ShouldStayTogether'),
  },
  {
    id: 'attribute-balance',
    routeSegment: 'attribute-balance',
    label: getConstraintDisplayName('AttributeBalance'),
    shortLabel: getConstraintDisplayName('AttributeBalance'),
    tooltipDescription: getConstraintTooltipDescription('AttributeBalance'),
    description: 'Steer group compositions toward desired attribute distributions.',
    group: 'preferences',
    order: 11,
    icon: Scale,
    status: 'available',
    surfaces: ['sidebar'],
    count: (context) => countConstraintsByType(context, 'AttributeBalance'),
  },
  {
    id: 'pair-meeting-count',
    routeSegment: 'pair-meeting-count',
    label: getConstraintDisplayName('PairMeetingCount'),
    shortLabel: getConstraintDisplayName('PairMeetingCount'),
    tooltipDescription: getConstraintTooltipDescription('PairMeetingCount'),
    description: 'Target how often important pairs should meet across sessions.',
    group: 'preferences',
    order: 12,
    icon: Users,
    status: 'available',
    surfaces: ['sidebar'],
    count: (context) => countConstraintsByType(context, 'PairMeetingCount'),
  },
  {
    id: 'objectives',
    routeSegment: 'objectives',
    label: 'Objectives',
    description: 'Tune optimization goals once the model and constraints are in place.',
    group: 'optimization',
    order: 13,
    icon: BarChart3,
    status: 'available',
    surfaces: ['legacy-tabs', 'sidebar'],
    count: ({ scenario, objectiveCount }) => (scenario ? objectiveCount : undefined),
  },
] as const;

export const DEFAULT_SCENARIO_SETUP_SECTION = 'people' as const;

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

export function getScenarioSetupPath(sectionId: string | null | undefined): string {
  const resolvedSection = sectionId ? getScenarioSetupSectionById(sectionId) : undefined;
  return `/app/scenario/${resolvedSection?.routeSegment ?? DEFAULT_SCENARIO_SETUP_SECTION}`;
}

export function isScenarioSetupSectionId(value: string): value is ScenarioSetupSectionId {
  return PROBLEM_SETUP_SECTIONS.some((section) => section.id === value);
}

export function resolveScenarioSetupSection(section: string | undefined): ScenarioSetupSectionId {
  if (section && isScenarioSetupSectionId(section)) {
    return section;
  }

  if (section && section in LEGACY_ROUTE_REDIRECTS) {
    return LEGACY_ROUTE_REDIRECTS[section];
  }

  return DEFAULT_SCENARIO_SETUP_SECTION;
}

export function getScenarioSetupLegacyRedirect(section: string | undefined): ScenarioSetupSectionId | null {
  if (!section) {
    return null;
  }

  return LEGACY_ROUTE_REDIRECTS[section] ?? null;
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
