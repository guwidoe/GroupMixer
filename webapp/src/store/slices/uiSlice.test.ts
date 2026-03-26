import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUISlice, initialUIState } from "./uiSlice";
import type { AppStore } from "../types";

function createHarness(overrides: Partial<AppStore> = {}) {
  let state = {
    ui: { ...initialUIState },
    ...overrides,
  } as unknown as AppStore;

  const set = (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
  };
  const get = () => state;

  const slice = createUISlice(set, get);
  state = { ...state, ...slice } as AppStore;

  return {
    slice,
    getState: () => state,
  };
}

describe("createUISlice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockReturnValue(1234567890);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("updates basic UI toggles", () => {
    const harness = createHarness();

    harness.slice.setActiveTab("solver");
    harness.slice.setLoading(false);
    harness.slice.setShowScenarioManager(true);
    harness.slice.setShowResultComparison(true);

    expect(harness.getState().ui).toMatchObject({
      activeTab: "solver",
      isLoading: false,
      showScenarioManager: true,
      showResultComparison: true,
    });
  });

  it("adds notifications with default duration and auto-removes them", () => {
    const harness = createHarness();

    harness.slice.addNotification({
      type: "info",
      title: "Saved",
      message: "Scenario saved",
    });

    expect(harness.getState().ui.notifications).toEqual([
      expect.objectContaining({
        id: "1234567890",
        duration: 5000,
        title: "Saved",
      }),
    ]);

    vi.advanceTimersByTime(5000);
    expect(harness.getState().ui.notifications).toEqual([]);
  });

  it("supports manual notification removal and clearing", () => {
    const harness = createHarness();
    harness.getState().ui.notifications = [
      { id: "1", type: "info", title: "One", message: "First", duration: 1000 },
      { id: "2", type: "error", title: "Two", message: "Second", duration: 1000 },
    ];

    harness.slice.removeNotification("1");
    expect(harness.getState().ui.notifications).toHaveLength(1);

    harness.slice.clearNotifications();
    expect(harness.getState().ui.notifications).toEqual([]);
  });
});
