import type { ToolPagePreset } from '../../pages/toolPageConfigs';
import type { QuickSetupBalanceTargets } from '../../utils/quickSetup/attributeBalanceTargets';

export type QuickSetupGroupingMode = 'groupCount' | 'groupSize';
export type QuickSetupInputMode = 'names' | 'csv';

export interface QuickSetupParticipantColumn {
  id: string;
  name: string;
  values: string;
}

export interface QuickSetupFixedAssignment {
  personId: string;
  groupId: string;
}

export interface QuickSetupDraft {
  participantInput: string;
  participantColumns?: QuickSetupParticipantColumn[];
  groupingMode: QuickSetupGroupingMode;
  groupingValue: number;
  sessions: number;
  avoidRepeatPairings: boolean;
  preset: ToolPagePreset;
  keepTogetherInput: string;
  avoidPairingsInput: string;
  inputMode: QuickSetupInputMode;
  fixedAssignments?: QuickSetupFixedAssignment[];
  balanceAttributeKey: string | null;
  balanceTargets?: QuickSetupBalanceTargets;
  manualBalanceAttributeKeys?: string[];
  advancedOpen: boolean;
  workspaceScenarioId: string | null;
}

export interface QuickSetupParticipant {
  id: string;
  name: string;
  attributes: Record<string, string>;
}

export interface QuickSetupGroupResult {
  id: string;
  members: QuickSetupParticipant[];
}

export interface QuickSetupSessionResult {
  sessionNumber: number;
  groups: QuickSetupGroupResult[];
}

export interface QuickSetupResult {
  seed: number;
  generatedAt: string;
  sessions: QuickSetupSessionResult[];
}

export interface QuickSetupConstraintGroup {
  names: string[];
}

export interface QuickSetupPairConstraint {
  left: string;
  right: string;
}

export interface QuickSetupAnalysis {
  participants: QuickSetupParticipant[];
  availableBalanceKeys: string[];
  balanceAttributes: Array<{
    key: string;
    values: string[];
  }>;
  fixedAssignments: QuickSetupFixedAssignment[];
  keepTogetherGroups: QuickSetupConstraintGroup[];
  avoidPairings: QuickSetupPairConstraint[];
  ignoredConstraintNames: string[];
}
