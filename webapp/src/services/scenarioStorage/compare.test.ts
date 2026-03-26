import { describe, expect, it } from "vitest";
import { compareScenarioConfigurations } from "./compare";
import { createSampleScenario } from "../../test/fixtures";

describe("compareScenarioConfigurations", () => {
  it("reports missing snapshots as different across all areas", () => {
    const result = compareScenarioConfigurations(createSampleScenario(), undefined);

    expect(result.isDifferent).toBe(true);
    expect(result.details.people).toContain("No configuration saved");
    expect(result.details.constraints).toContain("No configuration saved");
  });

  it("detects changed sections and leaves unchanged ones alone", () => {
    const current = createSampleScenario({ num_sessions: 3 });
    const snapshot = {
      people: current.people.slice(0, 2),
      groups: current.groups,
      num_sessions: 2,
      objectives: current.objectives,
      constraints: [],
    };

    const result = compareScenarioConfigurations(current, snapshot);

    expect(result.isDifferent).toBe(true);
    expect(result.changes.people).toBe(true);
    expect(result.changes.num_sessions).toBe(true);
    expect(result.details.people).toContain("4 now vs 2");
    expect(result.details.num_sessions).toContain("3 now vs 2");
    expect(result.changes.groups).toBeUndefined();
  });
});
