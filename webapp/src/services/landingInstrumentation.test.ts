import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildTelemetryPayload,
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
    expect(canonicalPathToLandingSlug('/random-team-generator')).toBe('random-team-generator');
    expect(canonicalPathToLandingSlug('/es/random-team-generator')).toBe('random-team-generator');
    expect(canonicalPathToLandingSlug('/de/random-team-generator')).toBe('random-team-generator');
    expect(canonicalPathToLandingSlug('/fr')).toBe('home');
    expect(canonicalPathToLandingSlug('/ja/random-team-generator')).toBe('random-team-generator');
    expect(canonicalPathToLandingSlug('/hi/random-team-generator')).toBe('random-team-generator');
    expect(canonicalPathToLandingSlug('/zh/random-team-generator')).toBe('random-team-generator');
  });

  it('reads experiment and variant from search while falling back to the landing slug', () => {
    expect(
      readTelemetryAttributionFromSearch({
        search: '?exp=seo-hero-test&var=B',
        fallbackLandingSlug: 'random-team-generator',
      }),
    ).toEqual({
      landingSlug: 'random-team-generator',
      experiment: 'seo-hero-test',
      variant: 'B',
    });
  });

  it('builds tracked app paths without cookies', () => {
    expect(
      buildTrackedAppPath('/app/results', {
        landingSlug: 'random-team-generator',
        experiment: 'seo-hero-test',
        variant: 'B',
      }),
    ).toBe('/app/results?lp=random-team-generator&exp=seo-hero-test&var=B');
  });

  it('persists URL attribution for later app events in the same tab', () => {
    captureTelemetryAttributionFromSearch({
      search: '?lp=random-team-generator&exp=seo-hero-test&var=B',
    });

    expect(getPersistedTelemetryAttribution()).toEqual({
      landingSlug: 'random-team-generator',
      experiment: 'seo-hero-test',
      variant: 'B',
    });
    expect(getActiveTelemetryAttribution('')).toEqual({
      landingSlug: 'random-team-generator',
      experiment: 'seo-hero-test',
      variant: 'B',
    });
  });

  it('merges attribution fields into telemetry payloads only when present', () => {
    expect(
      buildTelemetryPayload(
        { entryPath: '/app/solver' },
        {
          landingSlug: 'random-team-generator',
          experiment: 'seo-hero-test',
          variant: 'B',
        },
      ),
    ).toEqual({
      entryPath: '/app/solver',
      landingSlug: 'random-team-generator',
      experiment: 'seo-hero-test',
      variant: 'B',
    });
  });
});
