/**
 * UI slice - manages UI state, notifications, and modal visibility.
 */

import type { Notification } from "../../types";
import type { UIState, UIActions, StoreSlice } from "../types";
import { namifyPersonIdsInText } from '../../utils/personReferenceText';

const ADVANCED_MODE_STORAGE_KEY = 'groupmixer.advanced-mode.v1';
const WORKFLOW_GUIDE_BUTTON_STORAGE_KEY = 'groupmixer.show-workflow-guide-button.v1';

function readPersistedAdvancedMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(ADVANCED_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistAdvancedMode(enabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(ADVANCED_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // ignore storage errors
  }
}

function readPersistedWorkflowGuideButtonPreference(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const persisted = window.localStorage.getItem(WORKFLOW_GUIDE_BUTTON_STORAGE_KEY);
    return persisted == null ? true : persisted === 'true';
  } catch {
    return true;
  }
}

function persistWorkflowGuideButtonPreference(show: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(WORKFLOW_GUIDE_BUTTON_STORAGE_KEY, String(show));
  } catch {
    // ignore storage errors
  }
}

export const initialUIState: UIState["ui"] = {
  activeTab: "scenario",
  advancedModeEnabled: readPersistedAdvancedMode(),
  showWorkflowGuideButton: readPersistedWorkflowGuideButtonPreference(),
  isLoading: true, // Start with loading true
  notifications: [],
  showScenarioManager: false,
  showResultComparison: false,
  warmStartResultId: null,
  lastScenarioSetupSection: 'people',
};

export const createUISlice: StoreSlice<UIState & UIActions> = (set, get) => ({
  ui: initialUIState,

  setActiveTab: (activeTab) =>
    set((state) => ({
      ui: { ...state.ui, activeTab },
    })),

  setAdvancedModeEnabled: (advancedModeEnabled) => {
    persistAdvancedMode(advancedModeEnabled);
    set((state) => ({
      ui: { ...state.ui, advancedModeEnabled },
    }));
  },

  setShowWorkflowGuideButton: (showWorkflowGuideButton) => {
    persistWorkflowGuideButtonPreference(showWorkflowGuideButton);
    set((state) => ({
      ui: { ...state.ui, showWorkflowGuideButton },
    }));
  },

  setLoading: (isLoading) =>
    set((state) => ({
      ui: { ...state.ui, isLoading },
    })),

  setLastScenarioSetupSection: (lastScenarioSetupSection) =>
    set((state) => ({
      ui: { ...state.ui, lastScenarioSetupSection },
    })),

  addNotification: (notification) => {
    const people = get().scenario?.people ?? [];
    const id = Date.now().toString();
    const newNotification: Notification = {
      ...notification,
      title: namifyPersonIdsInText(notification.title, people),
      message: namifyPersonIdsInText(notification.message, people),
      id,
      duration: notification.duration ?? 5000, // Default 5 seconds
    };

    set((state) => ({
      ui: {
        ...state.ui,
        notifications: [...state.ui.notifications, newNotification],
      },
    }));

    // Auto-remove notification after duration
    const duration = newNotification.duration;
    if (duration && duration > 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, duration);
    }
  },

  removeNotification: (id) =>
    set((state) => ({
      ui: {
        ...state.ui,
        notifications: state.ui.notifications.filter((n) => n.id !== id),
      },
    })),

  clearNotifications: () =>
    set((state) => ({
      ui: { ...state.ui, notifications: [] },
    })),

  setShowScenarioManager: (show) =>
    set((state) => ({
      ui: { ...state.ui, showScenarioManager: show },
    })),

  setShowResultComparison: (show) =>
    set((state) => ({
      ui: { ...state.ui, showResultComparison: show },
    })),
});
