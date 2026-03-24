import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProblemSlice } from "./problemSlice";
import type { AppStore } from "../types";
import { createSampleProblem, createSavedProblem } from "../../test/fixtures";
import { problemStorage } from "../../services/problemStorage";

vi.mock("../../services/problemStorage", () => ({
  problemStorage: {
    createProblem: vi.fn(),
    setCurrentProblemId: vi.fn(),
    updateProblem: vi.fn(),
  },
}));

function createHarness(overrides: Partial<AppStore> = {}) {
  let state = {
    problem: null,
    currentProblemId: null,
    savedProblems: {},
    selectedResultIds: [],
    ui: {
      activeTab: "problem",
      isLoading: false,
      notifications: [],
      showProblemManager: false,
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
    slice: createProblemSlice(set, get),
    getState: () => state,
  };
}

describe("createProblemSlice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets and merges problem state", () => {
    const harness = createHarness();
    const problem = createSampleProblem();

    harness.slice.setProblem(problem);
    harness.slice.updateProblem({ num_sessions: 3 });

    expect(harness.getState().problem?.num_sessions).toBe(3);
    expect(harness.getState().problem?.people).toHaveLength(4);
  });

  it("returns a temporary empty problem while the UI is loading", () => {
    const harness = createHarness({
      ui: {
        activeTab: "problem",
        isLoading: true,
        notifications: [],
        showProblemManager: false,
        showResultComparison: false,
        warmStartResultId: null,
      },
    });

    const problem = harness.slice.resolveProblem();

    expect(problem.people).toEqual([]);
    expect(problem.groups).toEqual([]);
    expect(problem.num_sessions).toBe(3);
    expect(harness.getState().problem).toBeNull();
  });

  it("creates and stores a new problem when ensureProblemExists runs with no existing data", () => {
    const created = createSavedProblem({
      id: "created-problem",
      problem: createSampleProblem({ people: [], groups: [], num_sessions: 3 }),
      results: [],
    });
    vi.mocked(problemStorage.createProblem).mockReturnValue(created);

    const harness = createHarness();
    const ensured = harness.slice.ensureProblemExists();

    expect(problemStorage.createProblem).toHaveBeenCalledWith(
      "Untitled Problem",
      expect.objectContaining({ num_sessions: 3 })
    );
    expect(ensured.num_sessions).toBe(3);
    expect(harness.getState().currentProblemId).toBe("created-problem");
    expect(harness.getState().savedProblems["created-problem"]).toEqual(created);
    expect(harness.getState().ui.notifications).toHaveLength(1);
  });

  it("loads the first saved problem when no current problem is selected", () => {
    const saved = createSavedProblem();
    const harness = createHarness({
      savedProblems: { [saved.id]: saved },
    });

    const problem = harness.slice.resolveProblem();

    expect(problem).toEqual(saved.problem);
    expect(problemStorage.setCurrentProblemId).toHaveBeenCalledWith(saved.id);
    expect(harness.getState().currentProblemId).toBe(saved.id);
  });
});
