import { describe, expect, it } from "vitest";
import { generateAssignmentsCsv } from "./csvExport";
import { createSampleProblem, createSampleSolution } from "../test/fixtures";

describe("generateAssignmentsCsv", () => {
  it("exports metadata, headers, rows, and escaped values", () => {
    const problem = createSampleProblem({
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

    const csv = generateAssignmentsCsv(problem, solution, {
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
    expect(csv).toContain("p2,g1,1,p2,B");
  });
});
