import { describe, expect, it } from "vitest";
import {
  buildResultExportBaseName,
  createResultExportFile,
  generateAssignmentsCsv,
  generateParticipantItinerariesCsv,
  generateSessionRostersCsv,
} from "./csvExport";
import { createSampleScenario, createSampleSolution } from "../test/fixtures";

describe("generateAssignmentsCsv", () => {
  it("exports metadata, headers, rows, and escaped values", () => {
    const scenario = createSampleScenario({
      people: [
        { id: "p1", attributes: { name: 'Alice, "A"', team: "A" } },
        { id: "p2", attributes: { team: "B" } },
      ],
      groups: [{ id: "g1", size: 2 }],
      num_sessions: 1,
    });
    const solution = createSampleSolution({
      assignments: [
        { person_id: "p1", group_id: "g1", session_id: 0 },
        { person_id: "p2", group_id: "g1", session_id: 0 },
      ],
      final_score: 12.345,
      unique_contacts: 1,
      iteration_count: 1200,
      attribute_balance_penalty: 0,
      constraint_penalty: 0,
      weighted_repetition_penalty: 2,
      weighted_constraint_penalty: 0,
    });

    const csv = generateAssignmentsCsv(scenario, solution, {
      resultName: "Result 1",
      extraMetadata: [["Scenario", "Demo"]],
      exportedAt: Date.UTC(2024, 0, 2, 3, 4, 5),
    });

    expect(csv).toContain("Result Name,Result 1");
    expect(csv).toContain("Scenario,Demo");
    expect(csv).toContain("Export Date,2024-01-02T03:04:05.000Z");
    expect(csv).toContain('Iterations,"1,200"');
    expect(csv).toContain('"Alice, ""A"""');
    expect(csv).toContain("Person ID,Group ID,Session,Person Name,team");
    expect(csv).toContain("p2,g1,1,,B");
  });

  it("exports session rosters and participant itineraries for audience-specific downloads", () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();

    const rostersCsv = generateSessionRostersCsv(scenario, solution, {
      resultName: "Ops Run",
      exportedAt: Date.UTC(2024, 0, 2, 3, 4, 5),
    });
    const itinerariesCsv = generateParticipantItinerariesCsv(scenario, solution, {
      resultName: "Ops Run",
      exportedAt: Date.UTC(2024, 0, 2, 3, 4, 5),
    });

    expect(rostersCsv).toContain("Session,Group ID,Seat Capacity,Assigned Count,Open Seats,Person ID,Person Name");
    expect(rostersCsv).toContain("Session 1,g1,2,2,0,p1,Alice");
    expect(itinerariesCsv).toContain("Person ID,Person Name,team,Assigned Sessions,Session 1 Group,Session 2 Group");
    expect(itinerariesCsv).toContain("p1,Alice,A,2/2,g1,g1");
  });

  it("builds descriptive filenames and export bundles", () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();
    const exportedAt = Date.UTC(2024, 0, 2, 3, 4, 5);

    expect(buildResultExportBaseName("Result 1", exportedAt)).toBe("result-1-2024-01-02");

    const file = createResultExportFile(scenario, solution, "csv-session-rosters", {
      resultName: "Result 1",
      exportedAt,
    });
    const jsonBundle = createResultExportFile(scenario, solution, "json-result-bundle", {
      resultName: "Result 1",
      exportedAt,
    });

    expect(file.filename).toBe("result-1-2024-01-02-session-rosters.csv");
    expect(file.mimeType).toBe("text/csv");
    expect(jsonBundle.filename).toBe("result-1-2024-01-02-result-bundle.json");
    expect(jsonBundle.content).toContain('"Result Name": "Result 1"');
    expect(jsonBundle.content).toContain('"summary"');
  });
});
