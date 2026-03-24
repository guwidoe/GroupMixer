import { afterEach, describe, expect, it, vi } from 'vitest';

function createMatchMediaStub(matches = false) {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();

  return {
    matchMedia: vi.fn(() => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener,
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    addEventListener,
    removeEventListener,
  };
}

describe('theme store initialization', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('avoids theme side effects at import time', async () => {
    const { matchMedia } = createMatchMediaStub(true);
    vi.stubGlobal('matchMedia', matchMedia);
    Object.defineProperty(window, 'matchMedia', {
      value: matchMedia,
      configurable: true,
      writable: true,
    });

    await import('./theme');

    expect(matchMedia).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('hydrates persisted theme and cleans up its media listener on explicit init', async () => {
    const { matchMedia, addEventListener, removeEventListener } = createMatchMediaStub(true);
    vi.stubGlobal('matchMedia', matchMedia);
    Object.defineProperty(window, 'matchMedia', {
      value: matchMedia,
      configurable: true,
      writable: true,
    });
    localStorage.setItem(
      'theme-storage',
      JSON.stringify({ state: { theme: 'dark', isDark: false }, version: 0 }),
    );

    const { initializeThemeStore, useThemeStore } = await import('./theme');
    const cleanup = initializeThemeStore();

    await Promise.resolve();
    await Promise.resolve();

    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(useThemeStore.getState().isDark).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    cleanup();

    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
