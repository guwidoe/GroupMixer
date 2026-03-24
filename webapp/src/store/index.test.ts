import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './index';
import { ATTRIBUTE_DEFS_KEY, DEFAULT_ATTRIBUTE_DEFINITIONS } from './slices';

describe('useAppStore initialization', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().reset();
  });

  it('hydrates attribute definitions during initializeApp instead of store import', () => {
    const persistedDefinitions = [{ key: 'team', values: ['Blue', 'Red'] }];
    localStorage.setItem(ATTRIBUTE_DEFS_KEY, JSON.stringify(persistedDefinitions));

    expect(useAppStore.getState().attributeDefinitions).toEqual(DEFAULT_ATTRIBUTE_DEFINITIONS);

    useAppStore.getState().initializeApp();

    expect(useAppStore.getState().attributeDefinitions).toEqual(persistedDefinitions);
  });
});
