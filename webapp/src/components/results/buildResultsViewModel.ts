import type { Scenario, Solution } from '../../types';
import {
  buildResultsViewModel,
  type ResultsParticipantData,
  type ResultsSessionData,
  type ResultsSessionGroupData as ResultsSessionGroup,
  type ResultsSummaryData,
  type ResultsViewModel,
} from '../../services/results/buildResultsModel';

export type {
  ResultsParticipantData,
  ResultsSessionData,
  ResultsSessionGroup,
  ResultsSummaryData,
  ResultsViewModel,
};

export function buildResultsSessionData(scenario: Scenario, solution: Solution): ResultsSessionData[] {
  return buildResultsViewModel(scenario, solution).sessions;
}
