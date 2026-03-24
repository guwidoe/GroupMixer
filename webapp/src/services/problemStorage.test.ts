import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProblemStorageService,
  compareProblemConfigurations,
} from "./problemStorage";
import {
  createSampleProblem,
  createSampleSolution,
  createSampleSolverSettings,
  createSavedProblem,
} from "../test/fixtures";

function createService() {
  return new ProblemStorageService();
}

describe("ProblemStorageService", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("creates, persists, and summarizes problems", () => {
    const service = createService();
    const created = service.createProblem("Workshop", createSampleProblem(), true);

    expect(service.getProblem(created.id)?.name).toBe("Workshop");
    expect(service.getProblemSummaries()).toEqual([
      expect.objectContaining({
        id: created.id,
        name: "Workshop",
        peopleCount: 4,
        groupsCount: 2,
        sessionsCount: 2,
        isTemplate: true,
      }),
    ]);
  });

  it("adds results and snapshots the current problem state", () => {
    const service = createService();
    const saved = service.createProblem("Workshop", createSampleProblem());
    const currentProblemState = createSampleProblem({ num_sessions: 3 });

    const result = service.addResult(
      saved.id,
      createSampleSolution(),
      createSampleSolverSettings(),
      "Run 1",
      currentProblemState
    );

    expect(result.name).toBe("Run 1");
    expect(result.problemSnapshot?.num_sessions).toBe(3);
    expect(service.getProblem(saved.id)?.results).toHaveLength(1);
  });

  it("schedules autosaves when updating problems", () => {
    vi.useFakeTimers();
    const service = createService();
    const saved = service.createProblem("Workshop", createSampleProblem());

    service.updateProblem(saved.id, createSampleProblem({ num_sessions: 4 }));
    expect(service.getProblem(saved.id)?.problem.num_sessions).toBe(2);

    vi.advanceTimersByTime(2000);
    expect(service.getProblem(saved.id)?.problem.num_sessions).toBe(4);
  });

  it("exports, imports, and regenerates ids for imported results", () => {
    const service = createService();
    const saved = service.createProblem("Workshop", createSampleProblem());
    service.addResult(saved.id, createSampleSolution(), createSampleSolverSettings());
    const savedWithResult = service.getProblem(saved.id)!;

    const exported = service.exportProblem(saved.id);
    const imported = service.importProblem(exported, "Imported Workshop");

    expect(imported.id).not.toBe(saved.id);
    expect(imported.name).toBe("Imported Workshop");
    expect(imported.results[0].id).not.toBe(savedWithResult.results[0].id);
  });

  it("restores snapshots and migrates missing snapshots", () => {
    const service = createService();
    const saved = createSavedProblem({
      results: [
        {
          ...createSavedProblem().results[0],
          id: "result-no-snapshot",
          problemSnapshot: undefined,
        },
      ],
    });
    localStorage.setItem(
      "people-distributor-problems",
      JSON.stringify({ [saved.id]: saved })
    );

    service.migrateResultsAddProblemSnapshot(saved.id);
    const migrated = service.getProblem(saved.id)!;
    expect(migrated.results[0].problemSnapshot?.people).toHaveLength(4);

    const restored = service.restoreResultAsNewProblem(saved.id, migrated.results[0].id);
    expect(restored.problem.people).toHaveLength(4);
    expect(restored.results).toHaveLength(1);
  });

  it("compares saved snapshots against the current problem", () => {
    const current = createSampleProblem({ num_sessions: 3 });
    const snapshot = createSavedProblem().results[0].problemSnapshot;

    const diff = compareProblemConfigurations(current, snapshot);
    expect(diff.isDifferent).toBe(true);
    expect(diff.changes.num_sessions).toBe(true);
  });
});
