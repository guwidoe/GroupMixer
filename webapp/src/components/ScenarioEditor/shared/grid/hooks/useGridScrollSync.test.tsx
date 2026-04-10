import { describe, expect, it } from 'vitest';
import { hasScrollMetricChange } from './useGridScrollSync';

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
