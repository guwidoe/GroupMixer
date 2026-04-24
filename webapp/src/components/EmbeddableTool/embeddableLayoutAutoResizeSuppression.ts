import { useCallback, useEffect, useState } from 'react';

export type EmbeddableLayoutElementKey =
  | 'participants'
  | 'keep-together'
  | 'keep-apart'
  | 'pinned-people';

const MANUAL_LAYOUT_STORAGE_PREFIX = 'groupmixer.landing-layout.manual-adjusted-at.v1';
const MANUAL_LAYOUT_SUPPRESSION_MS = 24 * 60 * 60 * 1000;

function getStorageKey(elementKey: EmbeddableLayoutElementKey) {
  return `${MANUAL_LAYOUT_STORAGE_PREFIX}:${elementKey}`;
}

function readManualAdjustmentAt(elementKey: EmbeddableLayoutElementKey) {
  if (typeof window === 'undefined') {
    return null;
  }

  let rawValue: string | null = null;
  try {
    rawValue = window.localStorage.getItem(getStorageKey(elementKey));
  } catch {
    return null;
  }
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getSuppressionExpiresAt(elementKey: EmbeddableLayoutElementKey, now = Date.now()) {
  const adjustedAt = readManualAdjustmentAt(elementKey);
  if (adjustedAt == null) {
    return null;
  }

  const expiresAt = adjustedAt + MANUAL_LAYOUT_SUPPRESSION_MS;
  return expiresAt > now ? expiresAt : null;
}

export function recordEmbeddableLayoutManualAdjustment(elementKey: EmbeddableLayoutElementKey) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(getStorageKey(elementKey), String(Date.now()));
  } catch {
    // Treat unavailable storage as no persisted suppression.
  }
}

export function useEmbeddableLayoutAutoResizeSuppression(elementKey: EmbeddableLayoutElementKey) {
  const [version, setVersion] = useState(0);
  const expiresAt = getSuppressionExpiresAt(elementKey);
  const autoResizeSuppressed = expiresAt != null;

  useEffect(() => {
    if (expiresAt == null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setVersion((current) => current + 1);
    }, Math.max(0, expiresAt - Date.now()));

    return () => window.clearTimeout(timeoutId);
  }, [elementKey, expiresAt, version]);

  const recordManualLayoutAdjustment = useCallback(() => {
    recordEmbeddableLayoutManualAdjustment(elementKey);
    setVersion((current) => current + 1);
  }, [elementKey]);

  return {
    autoResizeSuppressed,
    recordManualLayoutAdjustment,
  };
}
