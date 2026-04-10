import { describe, expect, it } from 'vitest';
import { hasScrollMetricChange, resolveScrollMetricUpdate } from './useGridScrollSync';

describe('hasScrollMetricChange', () => {
  it('returns false for identical metrics', () => {
    expect(hasScrollMetricChange(
      { scrollWidth: 640, clientWidth: 320 },
      { scrollWidth: 640, clientWidth: 320 },
    )).toBe(false);
  });

  it('returns true when either metric changes', () => {
    expect(hasScrollMetricChange(
      { scrollWidth: 640, clientWidth: 320 },
      { scrollWidth: 641, clientWidth: 320 },
    )).toBe(true);

    expect(hasScrollMetricChange(
      { scrollWidth: 640, clientWidth: 320 },
      { scrollWidth: 640, clientWidth: 321 },
    )).toBe(true);
  });
});

describe('resolveScrollMetricUpdate', () => {
  it('returns null when metrics are unchanged so the hook can skip setState entirely', () => {
    expect(resolveScrollMetricUpdate(
      { scrollWidth: 640, clientWidth: 320 },
      { scrollWidth: 640, clientWidth: 320 },
    )).toBeNull();
  });

  it('returns the new metrics when they changed', () => {
    expect(resolveScrollMetricUpdate(
      { scrollWidth: 640, clientWidth: 320 },
      { scrollWidth: 800, clientWidth: 320 },
    )).toEqual({ scrollWidth: 800, clientWidth: 320 });
  });
});
