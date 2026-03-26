import { BarChart3, Calendar, Hash, Lock, Tag, Users, Zap } from 'lucide-react';
import type {
  ProblemSetupCountContext,
  ProblemSetupNavSurface,
  ProblemSetupSectionDefinition,
  ProblemSetupSectionGroupDefinition,
  ProblemSetupSectionId,
} from './problemSetupNavTypes';

const HARD_CONSTRAINT_TYPES = new Set(['ImmovablePeople', 'MustStayTogether']);
const SOFT_CONSTRAINT_TYPES = new Set([
  'RepeatEncounter',
  'AttributeBalance',
  'ShouldNotBeTogether',
  'ShouldStayTogether',
  'PairMeetingCount',
]);

export const PROBLEM_SETUP_SECTION_GROUPS: readonly ProblemSetupSectionGroupDefinition[] = [
  {
    id: 'model',
    label: 'Model',
    order: 1,
    description: 'Define the structure and entities that make up the problem.',
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

export const PROBLEM_SETUP_SECTIONS: readonly ProblemSetupSectionDefinition[] = [
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
    count: ({ problem }) => problem?.num_sessions ?? 0,
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
    count: ({ problem }) => problem?.groups.length ?? 0,
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
    status: 'planned',
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
    count: ({ problem }) => problem?.people.length ?? 0,
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
    count: ({ problem }) => problem?.constraints.filter((constraint) => HARD_CONSTRAINT_TYPES.has(String(constraint.type))).length ?? 0,
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
    count: ({ problem }) => problem?.constraints.filter((constraint) => SOFT_CONSTRAINT_TYPES.has(String(constraint.type))).length ?? 0,
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

export function getProblemSetupSectionCount(
  section: ProblemSetupSectionDefinition,
  context: ProblemSetupCountContext,
): number | undefined {
  return section.count?.(context);
}

export function getProblemSetupSections(options?: {
  surface?: ProblemSetupNavSurface;
  includePlanned?: boolean;
}): ProblemSetupSectionDefinition[] {
  const { surface, includePlanned = false } = options ?? {};

  return PROBLEM_SETUP_SECTIONS
    .filter((section) => (includePlanned ? true : section.status === 'available'))
    .filter((section) => (surface ? section.surfaces.includes(surface) : true))
    .slice()
    .sort((left, right) => left.order - right.order);
}

export function getProblemSetupSectionGroups(): ProblemSetupSectionGroupDefinition[] {
  return PROBLEM_SETUP_SECTION_GROUPS.slice().sort((left, right) => left.order - right.order);
}

export function getProblemSetupSectionById(sectionId: string): ProblemSetupSectionDefinition | undefined {
  return PROBLEM_SETUP_SECTIONS.find((section) => section.id === sectionId);
}

export function isProblemSetupSectionId(value: string): value is ProblemSetupSectionId {
  return PROBLEM_SETUP_SECTIONS.some((section) => section.id === value);
}

export function getProblemSetupSectionsByGroup(options?: {
  surface?: ProblemSetupNavSurface;
  includePlanned?: boolean;
}): Array<{ group: ProblemSetupSectionGroupDefinition; sections: ProblemSetupSectionDefinition[] }> {
  const sections = getProblemSetupSections(options);

  return getProblemSetupSectionGroups()
    .map((group) => ({
      group,
      sections: sections.filter((section) => section.group === group.id),
    }))
    .filter((entry) => entry.sections.length > 0);
}
