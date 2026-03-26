import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScenarioSlice } from "./scenarioSlice";
import type { AppStore } from "../types";
import { createSampleScenario, createSavedScenario } from "../../test/fixtures";
import { scenarioStorage } from "../../services/scenarioStorage";

vi.mock("../../services/scenarioStorage", () => ({
  scenarioStorage: {
    createScenario: vi.fn(),
    setCurrentScenarioId: vi.fn(),
    updateScenario: vi.fn(),
  },
}));

function createHarness(overrides: Partial<AppStore> = {}) {
  let state = {
    scenario: null,
    currentScenarioId: null,
    savedScenarios: {},
    selectedResultIds: [],
    ui: {
      activeTab: "scenario",
      isLoading: false,
      notifications: [],
      showScenarioManager: false,
      showResultComparison: false,
      warmStartResultId: null,
    },
    addNotification: vi.fn((notification) => {
      state.ui.notifications.push({
        ...notification,
        id: "notification-1",
        duration: notification.duration ?? 5000,
      });
    }),
    ...overrides,
  } as unknown as AppStore;

  const set = (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
  };
  const get = () => state;

  return {
    slice: createScenarioSlice(set, get),
    getState: () => state,
  };
}

describe("createScenarioSlice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets and merges scenario state", () => {
    const harness = createHarness();
    const scenario = createSampleScenario();

    harness.slice.setScenario(scenario);
    harness.slice.updateScenario({ num_sessions: 3 });

    expect(harness.getState().scenario?.num_sessions).toBe(3);
    expect(harness.getState().scenario?.people).toHaveLength(4);
  });

  it("returns a temporary empty scenario while the UI is loading", () => {
    const harness = createHarness({
      ui: {
        activeTab: "scenario",
        isLoading: true,
        notifications: [],
        showScenarioManager: false,
        showResultComparison: false,
        warmStartResultId: null,
      },
    });

    const scenario = harness.slice.resolveScenario();

    expect(scenario.people).toEqual([]);
    expect(scenario.groups).toEqual([]);
    expect(scenario.num_sessions).toBe(3);
    expect(harness.getState().scenario).toBeNull();
  });

  it("creates and stores a new scenario when ensureScenarioExists runs with no existing data", () => {
    const created = createSavedScenario({
      id: "created-scenario",
      scenario: createSampleScenario({ people: [], groups: [], num_sessions: 3 }),
      results: [],
    });
    vi.mocked(scenarioStorage.createScenario).mockReturnValue(created);

    const harness = createHarness();
    const ensured = harness.slice.ensureScenarioExists();

    expect(scenarioStorage.createScenario).toHaveBeenCalledWith(
      "Untitled Scenario",
      expect.objectContaining({ num_sessions: 3 })
    );
    expect(ensured.num_sessions).toBe(3);
    expect(harness.getState().currentScenarioId).toBe("created-scenario");
    expect(harness.getState().savedScenarios["created-scenario"]).toEqual(created);
    expect(harness.getState().ui.notifications).toHaveLength(1);
  });

  it("loads the first saved scenario when no current scenario is selected", () => {
    const saved = createSavedScenario();
    const harness = createHarness({
      savedScenarios: { [saved.id]: saved },
    });

    const scenario = harness.slice.resolveScenario();

    expect(scenario).toEqual(saved.scenario);
    expect(scenarioStorage.setCurrentScenarioId).toHaveBeenCalledWith(saved.id);
    expect(harness.getState().currentScenarioId).toBe(saved.id);
  });

  it("propagates persistence errors when updating the current scenario", () => {
    vi.mocked(scenarioStorage.updateScenario).mockImplementation(() => {
      throw new Error('disk full');
    });
    const harness = createHarness({
      scenario: createSampleScenario(),
    });

    expect(() => harness.slice.updateCurrentScenario('scenario-1', createSampleScenario())).toThrow('disk full');
  });
});
