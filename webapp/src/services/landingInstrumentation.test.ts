import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildTrackedAppPath,
  canonicalPathToLandingSlug,
  captureTelemetryAttributionFromSearch,
  getActiveTelemetryAttribution,
  getPersistedTelemetryAttribution,
  readTelemetryAttributionFromSearch,
} from './landingInstrumentation';

describe('landingInstrumentation attribution helpers', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('derives a stable landing slug from canonical paths', () => {
    expect(canonicalPathToLandingSlug('/')).toBe('home');
    expect(canonicalPathToLandingSlug('/es')).toBe('home');
    expect(canonicalPathToLandingSlug('/de')).toBe('home');
    expect(canonicalPathToLandingSlug('/fr')).toBe('home');
    expect(canonicalPathToLandingSlug('/ja')).toBe('home');
    expect(canonicalPathToLandingSlug('/hi')).toBe('home');
    expect(canonicalPathToLandingSlug('/zh')).toBe('home');
  });

  it('reads experiment and variant from search while falling back to the landing slug', () => {
    expect(
      readTelemetryAttributionFromSearch({
        search: '?exp=seo-hero-test&var=B',
        fallbackLandingSlug: 'home',
      }),
    ).toEqual({
      landingSlug: 'home',
      experiment: 'seo-hero-test',
      variant: 'B',
    });
  });

  it('builds tracked app paths without cookies', () => {
    expect(
      buildTrackedAppPath('/app/results', {
        landingSlug: 'home',
        experiment: 'seo-hero-test',
        variant: 'B',
      }),
    ).toBe('/app/results?lp=home&exp=seo-hero-test&var=B');
  });

  it('persists URL attribution for later app events in the same tab', () => {
    captureTelemetryAttributionFromSearch({
      search: '?lp=home&exp=seo-hero-test&var=B',
    });

    expect(getPersistedTelemetryAttribution()).toEqual({
      landingSlug: 'home',
      experiment: 'seo-hero-test',
      variant: 'B',
    });
    expect(getActiveTelemetryAttribution('')).toEqual({
      landingSlug: 'home',
      experiment: 'seo-hero-test',
      variant: 'B',
    });
  });
});
