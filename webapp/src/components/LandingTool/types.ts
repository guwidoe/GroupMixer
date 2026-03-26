import type { ToolPageConfig, ToolPagePreset } from '../../pages/toolPageConfigs';

export type QuickSetupGroupingMode = 'groupCount' | 'groupSize';
export type QuickSetupInputMode = 'names' | 'csv';

export interface QuickSetupDraft {
  participantInput: string;
  groupingMode: QuickSetupGroupingMode;
  groupingValue: number;
  sessions: number;
  preset: ToolPagePreset;
  avoidRepeatPairings: boolean;
  keepTogetherInput: string;
  avoidPairingsInput: string;
  inputMode: QuickSetupInputMode;
  balanceAttributeKey: string | null;
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
  keepTogetherGroups: QuickSetupConstraintGroup[];
  avoidPairings: QuickSetupPairConstraint[];
  ignoredConstraintNames: string[];
}

export interface QuickSetupPageContext {
  pageConfig: ToolPageConfig;
}
