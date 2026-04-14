import type { Scenario, Solution } from "../types";
import { buildResultsViewModel } from "../services/results/buildResultsModel";

function getAttributeKeys(scenario: Scenario): string[] {
  const attributeKeySet = new Set<string>();
  (scenario.people || []).forEach((person) => {
    Object.keys(person.attributes || {}).forEach((key) => {
      if (key !== "name") attributeKeySet.add(key);
    });
  });
  return Array.from(attributeKeySet).sort();
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export interface GenerateAssignmentsCsvOptions {
  resultName?: string;
  extraMetadata?: Array<[string, string]>;
  exportedAt?: number;
}

export function generateAssignmentsCsv(
  scenario: Scenario,
  solution: Solution,
  options?: GenerateAssignmentsCsvOptions
): string {
  const attributeKeys = getAttributeKeys(scenario);
  const resultsModel = buildResultsViewModel(scenario, solution);

  const headers = [
    "Person ID",
    "Group ID",
    "Session",
    "Person Name",
    ...attributeKeys,
  ];

  const rows = resultsModel.participants.flatMap((participant) =>
    participant.sessions
      .filter((assignment) => assignment.isAssigned && assignment.groupId)
      .map((assignment) => {
        const attributeValues = attributeKeys.map(
          (key) => participant.person.attributes?.[key] ?? ""
        );

        return [
          participant.personId,
          assignment.groupId ?? "",
          assignment.sessionIndex + 1,
          participant.person.attributes?.name ?? "",
          ...attributeValues,
        ];
      })
  );

  const exportedAt = options?.exportedAt ?? Date.now();
  const metadata: Array<[string, string]> = [
    ["Result Name", options?.resultName || "Result"],
    ["Export Date", new Date(exportedAt).toISOString()],
    ["Final Score", solution.final_score.toFixed(2)],
    ["Unique Contacts", solution.unique_contacts.toString()],
    ["Iterations", solution.iteration_count.toLocaleString()],
    [
      "Repetition Penalty",
      (
        solution.weighted_repetition_penalty ?? solution.repetition_penalty
      ).toFixed(2),
    ],
    ["Balance Penalty", solution.attribute_balance_penalty.toFixed(2)],
    [
      "Constraint Penalty",
      (
        solution.weighted_constraint_penalty ?? solution.constraint_penalty
      ).toFixed(2),
    ],
  ];

  if (options?.extraMetadata?.length) {
    metadata.splice(2, 0, ...options.extraMetadata);
  }

  const allRows: (string | number)[][] = [...metadata, [], headers, ...rows];

  return allRows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}
