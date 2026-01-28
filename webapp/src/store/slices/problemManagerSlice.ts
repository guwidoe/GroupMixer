/**
 * Problem Manager slice - handles saving, loading, and result management.
 */

import type { ProblemManagerActions, ProblemManagerState, StoreSlice } from '../types';
import { createProblemActions } from './problemManagerSlice/problemActions';
import { createResultActions } from './problemManagerSlice/resultActions';

export const createProblemManagerSlice: StoreSlice<
  ProblemManagerState & ProblemManagerActions
> = (set, get) => ({
  currentProblemId: null,
  savedProblems: {},
  selectedResultIds: [],
  ...createProblemActions(set, get),
  ...createResultActions(set, get),
});
