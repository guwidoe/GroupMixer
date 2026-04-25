import type { Scenario, Solution } from '../../types';
import {
  buildResultsViewModel,
  buildResultsPairMeetingRows,
  getResultsPairMeetingCell,
  getResultsPairMeetingCellTone,
  getResultsPairMeetingPairKey,
  type ResultsParticipantData,
  type ResultsPairMeetingCell,
  type ResultsPairMeetingAnnotation,
  type ResultsPairMeetingCostItem,
  type ResultsPairMeetingCellTone,
  type ResultsPairMeetingMatrix,
  type ResultsPairMeetingParticipant,
  type ResultsPairMeetingRow,
  type ResultsSessionData,
  type ResultsSessionGroupData as ResultsSessionGroup,
  type ResultsSummaryData,
  type ResultsViewModel,
} from '../../services/results/buildResultsModel';

export type {
  ResultsParticipantData,
  ResultsPairMeetingCell,
  ResultsPairMeetingAnnotation,
  ResultsPairMeetingCostItem,
  ResultsPairMeetingCellTone,
  ResultsPairMeetingMatrix,
  ResultsPairMeetingParticipant,
  ResultsPairMeetingRow,
  ResultsSessionData,
  ResultsSessionGroup,
  ResultsSummaryData,
  ResultsViewModel,
};

export {
  buildResultsPairMeetingRows,
  getResultsPairMeetingCell,
  getResultsPairMeetingCellTone,
  getResultsPairMeetingPairKey,
};

export function buildResultsSessionData(scenario: Scenario, solution: Solution): ResultsSessionData[] {
  return buildResultsViewModel(scenario, solution).sessions;
}
