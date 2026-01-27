/**
 * Editor slice - manages manual editor unsaved state and navigation hooks.
 */

import type { EditorState, EditorActions, StoreSlice } from "../types";

export const createEditorSlice: StoreSlice<EditorState & EditorActions> = (
  set
) => ({
  manualEditorUnsaved: false,
  manualEditorLeaveHook: null,

  setManualEditorUnsaved: (unsaved) => set({ manualEditorUnsaved: unsaved }),

  setManualEditorLeaveHook: (hook) => set({ manualEditorLeaveHook: hook }),
});
