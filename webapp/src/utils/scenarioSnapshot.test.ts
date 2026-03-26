import { describe, expect, it } from "vitest";
import { snapshotToScenario } from "./scenarioSnapshot";
import { createSampleScenario, createSampleSolverSettings } from "../test/fixtures";

describe("snapshotToScenario", () => {
  it("hydrates a snapshot with solver settings", () => {
    const scenario = createSampleScenario();
    const snapshot = {
      people: scenario.people,
      groups: scenario.groups,
      num_sessions: scenario.num_sessions,
      objectives: scenario.objectives,
      constraints: scenario.constraints,
    };
    const settings = createSampleSolverSettings();

    expect(snapshotToScenario(snapshot, settings)).toEqual({
      ...snapshot,
      settings,
    });
  });
});
