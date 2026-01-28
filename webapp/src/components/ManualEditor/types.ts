import type { Assignment } from '../../types';

export type Mode = 'strict' | 'warn' | 'free';

export interface PreviewDelta {
  groupId: string;
  sessionId: number;
  scoreDelta: number;
  uniqueDelta: number;
  constraintDelta: number;
}

export interface PendingMove {
  personId: string;
  fromGroupId?: string;
  toGroupId: string;
  sessionId: number;
  prevAssignments: Assignment[];
}
