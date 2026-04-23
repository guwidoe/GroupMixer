import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScenarioSlice } from "./scenarioSlice";
import type { AppStore } from "../types";
import { createSampleScenario, createSavedScenario } from '../../test/fixtures';
import { DEFAULT_ATTRIBUTE_DEFINITIONS } from './attributeSlice';
import { scenarioStorage } from "../../services/scenarioStorage";
import { createScenarioDocument } from '../scenarioDocument';

vi.mock("../../services/scenarioStorage", () => ({
  scenarioStorage: {
    createScenario: vi.fn(),
    setCurrentScenarioId: vi.fn(),
    updateScenario: vi.fn(),
  },
}));

function createHarness(overrides: Partial<AppStore> = {}) {
  let state = {
    scenarioDocument: null,
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
    attributeDefinitions: DEFAULT_ATTRIBUTE_DEFINITIONS,
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

  const slice = createScenarioSlice(set, get);
  state = { ...state, ...slice, ...overrides } as AppStore;

  return {
    slice,
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

  it("populates missing person names from ids when scenarios enter workspace state", () => {
    const harness = createHarness();
    const scenario = createSampleScenario({
      people: [
        { id: 'p1', attributes: { team: 'A' } },
        { id: 'p2', attributes: { name: '', team: 'B' } },
        { id: 'p3', attributes: { Name: 'Cara', team: 'C' } },
      ],
    });

    harness.slice.setScenario(scenario);

    expect(harness.getState().scenario?.people).toEqual([
      expect.objectContaining({ id: 'p1', attributes: expect.objectContaining({ name: 'p1', team: 'A' }) }),
      expect.objectContaining({ id: 'p2', attributes: expect.objectContaining({ name: 'p2', team: 'B' }) }),
      expect.objectContaining({ id: 'p3', attributes: expect.objectContaining({ name: 'Cara', team: 'C' }) }),
    ]);
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
      'Untitled Scenario',
      expect.objectContaining({ num_sessions: 3 }),
      DEFAULT_ATTRIBUTE_DEFINITIONS,
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

    expect(scenario).toEqual(createScenarioDocument(saved.scenario, saved.attributeDefinitions).scenario);
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

  it("persists the current scenario without rewriting the live workspace snapshot", () => {
    vi.mocked(scenarioStorage.updateScenario).mockImplementation(() => undefined);
    const scenario = createSampleScenario();
    const savedScenario = createSavedScenario({ id: 'scenario-1', scenario });
    const harness = createHarness({
      scenario,
      currentScenarioId: 'scenario-1',
      savedScenarios: { 'scenario-1': savedScenario },
    });

    harness.slice.updateCurrentScenario('scenario-1', scenario);

    expect(scenarioStorage.updateScenario).toHaveBeenCalledWith(
      'scenario-1',
      expect.any(Object),
      expect.any(Array),
    );
    expect(harness.getState().scenario).toBe(scenario);
    expect(harness.getState().savedScenarios['scenario-1']).toEqual(
      expect.objectContaining({
        scenario: expect.any(Object),
      }),
    );
  });
});
