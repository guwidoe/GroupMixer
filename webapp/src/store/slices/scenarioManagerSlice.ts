/**
 * Scenario Manager slice - handles saving, loading, and result management.
 */

import type { ScenarioManagerActions, ScenarioManagerState, StoreSlice } from '../types';
import { createScenarioActions } from './scenarioManagerSlice/scenarioActions';
import { createResultActions } from './scenarioManagerSlice/resultActions';

export const createScenarioManagerSlice: StoreSlice<
  ScenarioManagerState & ScenarioManagerActions
> = (set, get) => ({
  currentScenarioId: null,
  currentResultId: null,
  savedScenarios: {},
  selectedResultIds: [],
  ...createScenarioActions(set, get),
  ...createResultActions(set, get),
});
