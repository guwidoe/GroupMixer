import { TOOL_PAGE_CONFIGS_DATA, TOOL_PAGE_ROUTE_ENTRIES } from './toolPageConfigs.data.mjs';

export type ToolPagePreset = 'random' | 'balanced' | 'networking';

export type ToolPageKey =
  | 'home'
  | 'random-group-generator'
  | 'random-team-generator'
  | 'breakout-room-generator'
  | 'student-group-generator'
  | 'speed-networking-generator'
  | 'group-generator-with-constraints';

export interface ToolPageFaqEntry {
  question: string;
  answer: string;
}

export interface ToolPageConfig {
  key: ToolPageKey;
  canonicalPath: string;
  title: string;
  metaDescription: string;
  h1: string;
  subhead: string;
  defaultPreset: ToolPagePreset;
  faqEntries: ToolPageFaqEntry[];
}

export const TOOL_PAGE_CONFIGS = TOOL_PAGE_CONFIGS_DATA as Record<ToolPageKey, ToolPageConfig>;

export const TOOL_PAGE_ROUTES = TOOL_PAGE_ROUTE_ENTRIES as Array<{
  key: ToolPageKey;
  path: string;
}>;
