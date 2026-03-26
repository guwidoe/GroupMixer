import { describe, expect, it } from 'vitest';
import {
  buildToolPagePath,
  DEFAULT_LOCALE,
  getLocaleHomePath,
  getToolPageConfig,
  TOOL_PAGE_ROUTES,
} from './toolPageConfigs';

describe('toolPageConfigs locale routing', () => {
  it('keeps English unprefixed and builds prefixed locale routes for future locales', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(getLocaleHomePath('en')).toBe('/');
    expect(getLocaleHomePath('es')).toBe('/es');
    expect(getLocaleHomePath('fr')).toBe('/fr');
    expect(buildToolPagePath('es', 'random-team-generator', 'random-team-generator')).toBe('/es/random-team-generator');
    expect(buildToolPagePath('fr', 'random-team-generator', 'random-team-generator')).toBe('/fr/random-team-generator');
  });

  it('keeps the current live route inventory on the default locale until localized content is added', () => {
    expect(TOOL_PAGE_ROUTES.every((route) => route.locale === 'en')).toBe(true);
  });

  it('emits self-canonical English alternates plus x-default for the current locale surface', () => {
    const config = getToolPageConfig('random-team-generator', 'en');

    expect(config.canonicalPath).toBe('/random-team-generator');
    expect(config.alternates).toEqual([
      { hreflang: 'en', canonicalPath: '/random-team-generator' },
      { hreflang: 'x-default', canonicalPath: '/random-team-generator' },
    ]);
  });
});
