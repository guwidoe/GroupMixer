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

function serializeCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeTsvCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " / ");
}

function serializeTsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(escapeTsvCell).join("\t")).join("\n");
}

function sanitizeFileSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "result";
}

export interface GenerateAssignmentsCsvOptions {
  resultName?: string;
  extraMetadata?: Array<[string, string]>;
  exportedAt?: number;
}

export type ResultExportAction =
  | "json-result-bundle"
  | "csv-full-schedule"
  | "excel-full-schedule"
  | "csv-session-rosters"
  | "csv-participant-itineraries";

export type ResultClipboardAction =
  | "copy-full-schedule"
  | "copy-participant-itineraries";

export interface ResultExportFile {
  filename: string;
  mimeType: string;
  content: string;
}

function buildMetadataRows(
  scenario: Scenario,
  solution: Solution,
  options?: GenerateAssignmentsCsvOptions,
): Array<[string, string]> {
  const resultsModel = buildResultsViewModel(scenario, solution);
  const exportedAt = options?.exportedAt ?? Date.now();
  const metadata: Array<[string, string]> = [
    ["Result Name", options?.resultName || "Result"],
    ["Export Date", new Date(exportedAt).toISOString()],
    ["Final Score", solution.final_score.toFixed(2)],
    ["Unique Contacts", solution.unique_contacts.toString()],
    ["Iterations", solution.iteration_count.toLocaleString()],
    ["People", resultsModel.summary.totalPeople.toString()],
    ["Sessions", resultsModel.summary.totalSessions.toString()],
    ["Assignments", resultsModel.summary.totalAssignments.toString()],
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

  return metadata;
}

function buildCsvDocument(
  scenario: Scenario,
  solution: Solution,
  headers: string[],
  rows: Array<Array<string | number>>,
  options?: GenerateAssignmentsCsvOptions,
): string {
  const metadata = buildMetadataRows(scenario, solution, options);
  const allRows: Array<Array<string | number>> = [...metadata, [], headers, ...rows];
  return serializeCsv(allRows);
}

export function buildResultExportBaseName(
  resultName?: string,
  exportedAt: number = Date.now(),
): string {
  const slug = sanitizeFileSegment(resultName || "result");
  const dateStamp = new Date(exportedAt).toISOString().slice(0, 10);
  return `${slug}-${dateStamp}`;
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

  return buildCsvDocument(scenario, solution, headers, rows, options);
}

export function generateSessionRostersCsv(
  scenario: Scenario,
  solution: Solution,
  options?: GenerateAssignmentsCsvOptions,
): string {
  const attributeKeys = getAttributeKeys(scenario);
  const resultsModel = buildResultsViewModel(scenario, solution);
  const headers = [
    "Session",
    "Group ID",
    "Seat Capacity",
    "Assigned Count",
    "Open Seats",
    "Person ID",
    "Person Name",
    ...attributeKeys,
  ];

  const rows = resultsModel.sessions.flatMap((session) =>
    session.groups.flatMap((group) => {
      if (group.people.length === 0) {
        return [[
          session.label,
          group.id,
          group.size,
          group.assignedCount,
          group.openSeats,
          "",
          "",
          ...attributeKeys.map(() => ""),
        ]];
      }

      return group.people.map((person) => [
        session.label,
        group.id,
        group.size,
        group.assignedCount,
        group.openSeats,
        person.id,
        person.attributes?.name ?? "",
        ...attributeKeys.map((key) => person.attributes?.[key] ?? ""),
      ]);
    })
  );

  return buildCsvDocument(scenario, solution, headers, rows, options);
}

export function generateParticipantItinerariesCsv(
  scenario: Scenario,
  solution: Solution,
  options?: GenerateAssignmentsCsvOptions,
): string {
  const attributeKeys = getAttributeKeys(scenario);
  const resultsModel = buildResultsViewModel(scenario, solution);
  const sessionHeaders = resultsModel.sessions.map((session) => `${session.label} Group`);
  const headers = [
    "Person ID",
    "Person Name",
    ...attributeKeys,
    "Assigned Sessions",
    ...sessionHeaders,
  ];

  const rows = resultsModel.participants.map((participant) => [
    participant.personId,
    participant.person.attributes?.name ?? "",
    ...attributeKeys.map((key) => participant.person.attributes?.[key] ?? ""),
    `${participant.assignedSessions}/${resultsModel.summary.totalSessions}`,
    ...participant.sessions.map((session) => session.groupId ?? "Not assigned"),
  ]);

  return buildCsvDocument(scenario, solution, headers, rows, options);
}

export function createResultExportFile(
  scenario: Scenario,
  solution: Solution,
  action: ResultExportAction,
  options?: GenerateAssignmentsCsvOptions,
): ResultExportFile {
  const exportedAt = options?.exportedAt ?? Date.now();
  const baseName = buildResultExportBaseName(options?.resultName, exportedAt);
  const metadataRows = buildMetadataRows(scenario, solution, { ...options, exportedAt });

  switch (action) {
    case "json-result-bundle": {
      const payload = {
        metadata: Object.fromEntries(metadataRows),
        scenario,
        solution,
        summary: buildResultsViewModel(scenario, solution).summary,
      };

      return {
        filename: `${baseName}-result-bundle.json`,
        mimeType: "application/json",
        content: JSON.stringify(payload, null, 2),
      };
    }
    case "csv-full-schedule":
      return {
        filename: `${baseName}-full-schedule.csv`,
        mimeType: "text/csv",
        content: generateAssignmentsCsv(scenario, solution, { ...options, exportedAt }),
      };
    case "excel-full-schedule":
      return {
        filename: `${baseName}-full-schedule.xls`,
        mimeType: "application/vnd.ms-excel",
        content: generateAssignmentsCsv(scenario, solution, { ...options, exportedAt }),
      };
    case "csv-session-rosters":
      return {
        filename: `${baseName}-session-rosters.csv`,
        mimeType: "text/csv",
        content: generateSessionRostersCsv(scenario, solution, { ...options, exportedAt }),
      };
    case "csv-participant-itineraries":
      return {
        filename: `${baseName}-participant-itineraries.csv`,
        mimeType: "text/csv",
        content: generateParticipantItinerariesCsv(scenario, solution, { ...options, exportedAt }),
      };
  }
}

export function createResultClipboardText(
  scenario: Scenario,
  solution: Solution,
  action: ResultClipboardAction,
): string {
  const attributeKeys = getAttributeKeys(scenario);
  const resultsModel = buildResultsViewModel(scenario, solution);

  switch (action) {
    case "copy-full-schedule": {
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
          .map((assignment) => [
            participant.personId,
            assignment.groupId ?? "",
            assignment.sessionLabel,
            participant.person.attributes?.name ?? "",
            ...attributeKeys.map((key) => participant.person.attributes?.[key] ?? ""),
          ])
      );

      return serializeTsv([headers, ...rows]);
    }
    case "copy-participant-itineraries": {
      const headers = [
        "Person ID",
        "Person Name",
        ...attributeKeys,
        "Assigned Sessions",
        ...resultsModel.sessions.map((session) => `${session.label} Group`),
      ];

      const rows = resultsModel.participants.map((participant) => [
        participant.personId,
        participant.person.attributes?.name ?? "",
        ...attributeKeys.map((key) => participant.person.attributes?.[key] ?? ""),
        `${participant.assignedSessions}/${resultsModel.summary.totalSessions}`,
        ...participant.sessions.map((session) => session.groupId ?? "Not assigned"),
      ]);

      return serializeTsv([headers, ...rows]);
    }
  }
}
