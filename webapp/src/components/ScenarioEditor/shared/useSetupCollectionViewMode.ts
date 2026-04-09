import React from 'react';

export type SetupCollectionViewMode = 'cards' | 'list';

const VIEW_MODE_STORAGE_KEY = 'gm:scenario-setup:view-modes:v2';

function readStoredViewModes(): Record<string, SetupCollectionViewMode> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, SetupCollectionViewMode>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeStoredViewModes(next: Record<string, SetupCollectionViewMode>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures; the UI can still function with in-memory state.
  }
}

export function useSetupCollectionViewMode(sectionKey: string, defaultMode: SetupCollectionViewMode = 'cards') {
  const [viewMode, setViewModeState] = React.useState<SetupCollectionViewMode>(() => {
    const stored = readStoredViewModes();
    return stored[sectionKey] ?? defaultMode;
  });

  const setViewMode = React.useCallback(
    (nextMode: SetupCollectionViewMode) => {
      setViewModeState(nextMode);
      const stored = readStoredViewModes();
      writeStoredViewModes({
        ...stored,
        [sectionKey]: nextMode,
      });
    },
    [sectionKey],
  );

  return {
    viewMode,
    setViewMode,
  };
}
