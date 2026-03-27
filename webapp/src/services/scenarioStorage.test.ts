import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScenarioStorageService,
  buildScenarioDraftIdentityHash,
  compareScenarioConfigurations,
} from "./scenarioStorage";
import {
  createSampleScenario,
  createSampleSolution,
  createSampleSolverSettings,
  createSavedScenario,
} from "../test/fixtures";

function createService() {
  return new ScenarioStorageService();
}

describe("ScenarioStorageService", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates, persists, and summarizes scenarios", () => {
    const service = createService();
    const created = service.createScenario("Workshop", createSampleScenario(), true);

    expect(service.getScenario(created.id)?.name).toBe("Workshop");
    expect(service.getScenarioSummaries()).toEqual([
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

  it("falls back to an empty scenario map when localStorage contains malformed JSON", () => {
    localStorage.setItem("people-distributor-scenarios", "{not-json");

    const service = createService();
    expect(service.getAllScenarios()).toEqual({});
    expect(service.getScenarioSummaries()).toEqual([]);
  });

  it("adds results and snapshots the current scenario state", () => {
    const service = createService();
    const saved = service.createScenario("Workshop", createSampleScenario());
    const currentScenarioState = createSampleScenario({ num_sessions: 3 });

    const result = service.addResult(
      saved.id,
      createSampleSolution(),
      createSampleSolverSettings(),
      "Run 1",
      currentScenarioState
    );

    expect(result.name).toBe("Run 1");
    expect(result.scenarioSnapshot?.num_sessions).toBe(3);
    expect(service.getScenario(saved.id)?.results).toHaveLength(1);
  });

  it("schedules autosaves when updating scenarios", () => {
    vi.useFakeTimers();
    const service = createService();
    const saved = service.createScenario("Workshop", createSampleScenario());

    service.updateScenario(saved.id, createSampleScenario({ num_sessions: 4 }));
    expect(service.getScenario(saved.id)?.scenario.num_sessions).toBe(2);

    vi.advanceTimersByTime(2000);
    expect(service.getScenario(saved.id)?.scenario.num_sessions).toBe(4);
  });

  it("preserves newly saved results when a pending autosave flushes an updated scenario definition", () => {
    vi.useFakeTimers();
    const service = createService();
    const saved = service.createScenario("Workshop", createSampleScenario());

    service.updateScenario(saved.id, createSampleScenario({ num_sessions: 4 }));
    service.addResult(saved.id, createSampleSolution(), createSampleSolverSettings(), "Run 1");

    vi.advanceTimersByTime(2000);

    const persisted = service.getScenario(saved.id)!;
    expect(persisted.scenario.num_sessions).toBe(4);
    expect(persisted.results).toHaveLength(1);
    expect(persisted.results[0].name).toBe("Run 1");
  });

  it("exports, imports, and regenerates ids for imported results", () => {
    const service = createService();
    const saved = service.createScenario("Workshop", createSampleScenario());
    service.addResult(saved.id, createSampleSolution(), createSampleSolverSettings());
    const savedWithResult = service.getScenario(saved.id)!;

    const exported = service.exportScenario(saved.id);
    const imported = service.importScenario(exported, "Imported Workshop");

    expect(imported.id).not.toBe(saved.id);
    expect(imported.name).toBe("Imported Workshop");
    expect(imported.results[0].id).not.toBe(savedWithResult.results[0].id);
  });

  it("surfaces a helpful error when persistence hits storage limits", () => {
    const service = createService();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() =>
      service.createScenario("Too big", createSampleScenario())
    ).toThrow(/storage quota exceeded/i);
  });

  it("throws when deleting a scenario cannot be persisted", () => {
    const service = createService();
    const created = service.createScenario("Workshop", createSampleScenario());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => service.deleteScenario(created.id)).toThrow(/storage quota exceeded/i);
  });

  it("restores snapshots and migrates missing snapshots", () => {
    const service = createService();
    const saved = createSavedScenario({
      results: [
        {
          ...createSavedScenario().results[0],
          id: "result-no-snapshot",
          scenarioSnapshot: undefined,
        },
      ],
    });
    localStorage.setItem(
      "people-distributor-scenarios",
      JSON.stringify({ [saved.id]: saved })
    );

    service.migrateResultsAddScenarioSnapshot(saved.id);
    const migrated = service.getScenario(saved.id)!;
    expect(migrated.results[0].scenarioSnapshot?.people).toHaveLength(4);

    const restored = service.restoreResultAsNewScenario(saved.id, migrated.results[0].id);
    expect(restored.scenario.people).toHaveLength(4);
    expect(restored.results).toHaveLength(1);
  });

  it("compares saved snapshots against the current scenario", () => {
    const current = createSampleScenario({ num_sessions: 3 });
    const snapshot = createSavedScenario().results[0].scenarioSnapshot;

    const diff = compareScenarioConfigurations(current, snapshot);
    expect(diff.isDifferent).toBe(true);
    expect(diff.changes.num_sessions).toBe(true);
  });

  it("builds the same draft identity hash only when both name and scenario match", () => {
    const scenario = createSampleScenario();

    expect(buildScenarioDraftIdentityHash("Workshop", scenario)).toBe(
      buildScenarioDraftIdentityHash("Workshop", createSampleScenario())
    );
    expect(buildScenarioDraftIdentityHash("Workshop", scenario)).not.toBe(
      buildScenarioDraftIdentityHash("Workshop copy", scenario)
    );
    expect(buildScenarioDraftIdentityHash("Workshop", scenario)).not.toBe(
      buildScenarioDraftIdentityHash("Workshop", createSampleScenario({ num_sessions: 3 }))
    );
  });

  it("finds an existing scenario by exact draft identity", () => {
    const service = createService();
    const exact = service.createScenario("Workshop", createSampleScenario());
    service.createScenario("Workshop", createSampleScenario({ num_sessions: 3 }));
    service.createScenario("Workshop copy", createSampleScenario());

    expect(service.findScenarioByDraftIdentity("Workshop", createSampleScenario())?.id).toBe(exact.id);
  });

  it("tracks the current scenario id and can clear all persisted data", () => {
    const service = createService();
    const created = service.createScenario("Workshop", createSampleScenario());

    service.setCurrentScenarioId(created.id);
    expect(service.getCurrentScenarioId()).toBe(created.id);

    service.clearAllData();
    expect(service.getCurrentScenarioId()).toBeNull();
    expect(service.getAllScenarios()).toEqual({});
  });
});
