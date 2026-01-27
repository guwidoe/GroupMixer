/**
 * UI slice - manages UI state, notifications, and modal visibility.
 */

import type { Notification } from "../../types";
import type { UIState, UIActions, StoreSlice } from "../types";

export const initialUIState: UIState["ui"] = {
  activeTab: "problem",
  isLoading: true, // Start with loading true
  notifications: [],
  showProblemManager: false,
  showResultComparison: false,
  warmStartResultId: null,
};

export const createUISlice: StoreSlice<UIState & UIActions> = (set, get) => ({
  ui: initialUIState,

  setActiveTab: (activeTab) =>
    set((state) => ({
      ui: { ...state.ui, activeTab },
    })),

  setLoading: (isLoading) =>
    set((state) => ({
      ui: { ...state.ui, isLoading },
    })),

  addNotification: (notification) => {
    const id = Date.now().toString();
    const newNotification: Notification = {
      ...notification,
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

  setShowProblemManager: (show) =>
    set((state) => ({
      ui: { ...state.ui, showProblemManager: show },
    })),

  setShowResultComparison: (show) =>
    set((state) => ({
      ui: { ...state.ui, showResultComparison: show },
    })),
});
