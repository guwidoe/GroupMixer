import { describe, expect, it } from "vitest";
import { snapshotToProblem } from "./problemSnapshot";
import { createSampleProblem, createSampleSolverSettings } from "../test/fixtures";

describe("snapshotToProblem", () => {
  it("hydrates a snapshot with solver settings", () => {
    const problem = createSampleProblem();
    const snapshot = {
      people: problem.people,
      groups: problem.groups,
      num_sessions: problem.num_sessions,
      objectives: problem.objectives,
      constraints: problem.constraints,
    };
    const settings = createSampleSolverSettings();

    expect(snapshotToProblem(snapshot, settings)).toEqual({
      ...snapshot,
      settings,
    });
  });
});
