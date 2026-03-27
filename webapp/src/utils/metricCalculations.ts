import { Scenario, Solution, ScenarioSnapshot } from "../types";
import { getScenarioMaxGroupCapacity } from './groupCapacities';

export interface MetricCalculations {
  peopleCount: number;
  numSessions: number;
  maxUniqueTotalTheoretical: number;
  maxAvgContactsTheoretical: number;
  capacityBiggestGroup: number;
  altMaxAvgContacts: number;
  altMaxUniqueTotal: number;
  effectiveMaxAvgContacts: number;
  effectiveMaxUniqueTotal: number;
  avgUniqueContacts: number;
  uniqueRatio: number;
  avgRatio: number;
  uniqueColorClass: string;
  avgColorClass: string;
}

// Helper function to get color class based on ratio
export function getColorClass(ratio: number, invert: boolean = false): string {
  // Clamp between 0 and 1
  let r = Math.max(0, Math.min(1, ratio));
  if (invert) r = 1 - r;
  if (r >= 0.9) return "text-green-600";
  if (r >= 0.75) return "text-lime-600";
  if (r >= 0.5) return "text-yellow-600";
  if (r >= 0.25) return "text-orange-600";
  return "text-red-600";
}

// Calculate all metrics using a specific scenario configuration
export function calculateMetrics(
  scenarioConfig: Scenario | ScenarioSnapshot,
  solution: Solution
): MetricCalculations {
  const peopleCount = scenarioConfig.people.length || 1;
  const numSessions = scenarioConfig.num_sessions || 0;
  const maxUniqueTotalTheoretical = (peopleCount * (peopleCount - 1)) / 2;
  const maxAvgContactsTheoretical = peopleCount - 1;

  // Alternative bound based on sessions & largest group capacity
  const capacityBiggestGroup =
    scenarioConfig.groups && scenarioConfig.groups.length > 0
      ? getScenarioMaxGroupCapacity(scenarioConfig)
      : 0;

  const altMaxAvgContacts = numSessions * Math.max(0, capacityBiggestGroup - 1);
  const altMaxUniqueTotal = (altMaxAvgContacts * peopleCount) / 2;

  const effectiveMaxAvgContacts = Math.max(
    1,
    Math.min(
      maxAvgContactsTheoretical,
      altMaxAvgContacts || maxAvgContactsTheoretical
    )
  );
  const effectiveMaxUniqueTotal = Math.max(
    1,
    Math.min(
      maxUniqueTotalTheoretical,
      altMaxUniqueTotal || maxUniqueTotalTheoretical
    )
  );

  const avgUniqueContacts = (solution.unique_contacts * 2) / peopleCount;
  const uniqueRatio = solution.unique_contacts / effectiveMaxUniqueTotal;
  const avgRatio = avgUniqueContacts / effectiveMaxAvgContacts;

  const uniqueColorClass = getColorClass(uniqueRatio);
  const avgColorClass = getColorClass(avgRatio);

  return {
    peopleCount,
    numSessions,
    maxUniqueTotalTheoretical,
    maxAvgContactsTheoretical,
    capacityBiggestGroup,
    altMaxAvgContacts,
    altMaxUniqueTotal,
    effectiveMaxAvgContacts,
    effectiveMaxUniqueTotal,
    avgUniqueContacts,
    uniqueRatio,
    avgRatio,
    uniqueColorClass,
    avgColorClass,
  };
}
