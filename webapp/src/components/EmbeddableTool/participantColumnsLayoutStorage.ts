import { LAYOUT_AUTO_RESIZE_SUPPRESSION_MS } from './layoutAutoResizeSuppression';

export const PARTICIPANT_COLUMNS_LAYOUT_STORAGE_KEY = 'groupmixer.embeddable-tool.participant-columns-layout.v1';

export interface ParticipantColumnsLayout {
  savedAt: number;
  height?: number;
  columnWidths?: number[];
  ghostColumnWidth?: number;
}

export function readStoredParticipantColumnsLayout(now = Date.now()): ParticipantColumnsLayout | null {
  if (typeof window === 'undefined') {
    return null;
  }

  let rawValue: string | null = null;
  try {
    rawValue = window.localStorage.getItem(PARTICIPANT_COLUMNS_LAYOUT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<ParticipantColumnsLayout>;
    if (
      typeof parsedValue.savedAt !== 'number'
      || !Number.isFinite(parsedValue.savedAt)
      || parsedValue.savedAt + LAYOUT_AUTO_RESIZE_SUPPRESSION_MS <= now
    ) {
      return null;
    }

    return {
      savedAt: parsedValue.savedAt,
      height: typeof parsedValue.height === 'number' && Number.isFinite(parsedValue.height)
        ? parsedValue.height
        : undefined,
      columnWidths: Array.isArray(parsedValue.columnWidths)
        ? parsedValue.columnWidths.filter((width) => typeof width === 'number' && Number.isFinite(width))
        : undefined,
      ghostColumnWidth: typeof parsedValue.ghostColumnWidth === 'number' && Number.isFinite(parsedValue.ghostColumnWidth)
        ? parsedValue.ghostColumnWidth
        : undefined,
    };
  } catch {
    return null;
  }
}

export function writeStoredParticipantColumnsLayout(update: Omit<Partial<ParticipantColumnsLayout>, 'savedAt'>) {
  if (typeof window === 'undefined') {
    return;
  }

  const current = readStoredParticipantColumnsLayout() ?? { savedAt: Date.now() };
  const nextLayout: ParticipantColumnsLayout = {
    ...current,
    ...update,
    savedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(PARTICIPANT_COLUMNS_LAYOUT_STORAGE_KEY, JSON.stringify(nextLayout));
  } catch {
    // Treat unavailable storage as non-persistent layout.
  }
}
