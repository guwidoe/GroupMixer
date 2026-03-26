import { describe, expect, it } from "vitest";
import { calculateMetrics, getColorClass } from "./metricCalculations";
import { createSampleScenario, createSampleSolution } from "../test/fixtures";

describe("getColorClass", () => {
  it("clamps ratios and maps them to color classes", () => {
    expect(getColorClass(1.5)).toBe("text-green-600");
    expect(getColorClass(0.8)).toBe("text-lime-600");
    expect(getColorClass(0.6)).toBe("text-yellow-600");
    expect(getColorClass(0.3)).toBe("text-orange-600");
    expect(getColorClass(-1)).toBe("text-red-600");
  });

  it("supports inverted scales", () => {
    expect(getColorClass(0.1, true)).toBe("text-green-600");
  });
});

describe("calculateMetrics", () => {
  it("derives theoretical and achieved metrics from a scenario and solution", () => {
    const metrics = calculateMetrics(createSampleScenario(), createSampleSolution());

    expect(metrics.peopleCount).toBe(4);
    expect(metrics.numSessions).toBe(2);
    expect(metrics.maxUniqueTotalTheoretical).toBe(6);
    expect(metrics.capacityBiggestGroup).toBe(2);
    expect(metrics.avgUniqueContacts).toBe(2);
    expect(metrics.uniqueRatio).toBeCloseTo(4 / 4);
    expect(metrics.avgRatio).toBeCloseTo(2 / 2);
    expect(metrics.uniqueColorClass).toBe("text-green-600");
    expect(metrics.avgColorClass).toBe("text-green-600");
  });

  it("uses safe minimum denominators for empty scenarios", () => {
    const metrics = calculateMetrics(
      createSampleScenario({ people: [], groups: [], num_sessions: 0 }),
      createSampleSolution({ unique_contacts: 0 })
    );

    expect(metrics.peopleCount).toBe(1);
    expect(metrics.effectiveMaxAvgContacts).toBe(1);
    expect(metrics.effectiveMaxUniqueTotal).toBe(1);
    expect(metrics.uniqueRatio).toBe(0);
    expect(metrics.avgRatio).toBe(0);
  });
});
