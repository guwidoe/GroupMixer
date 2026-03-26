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
    expect(getLocaleHomePath('ja')).toBe('/ja');
    expect(getLocaleHomePath('hi')).toBe('/hi');
    expect(getLocaleHomePath('zh')).toBe('/zh');
    expect(buildToolPagePath('es', 'random-team-generator', 'random-team-generator')).toBe('/es/random-team-generator');
    expect(buildToolPagePath('fr', 'random-team-generator', 'random-team-generator')).toBe('/fr/random-team-generator');
    expect(buildToolPagePath('ja', 'random-team-generator', 'random-team-generator')).toBe('/ja/random-team-generator');
    expect(buildToolPagePath('hi', 'random-team-generator', 'random-team-generator')).toBe('/hi/random-team-generator');
    expect(buildToolPagePath('zh', 'random-team-generator', 'random-team-generator')).toBe('/zh/random-team-generator');
  });

  it('adds all approved locale-prefixed routes for the selected localized rollout pages', () => {
    expect(TOOL_PAGE_ROUTES).toEqual(
      expect.arrayContaining([
        { key: 'home', locale: 'es', path: '/es' },
        { key: 'home', locale: 'fr', path: '/fr' },
        { key: 'home', locale: 'ja', path: '/ja' },
        { key: 'home', locale: 'hi', path: '/hi' },
        { key: 'home', locale: 'zh', path: '/zh' },
        { key: 'random-team-generator', locale: 'es', path: '/es/random-team-generator' },
        { key: 'random-team-generator', locale: 'fr', path: '/fr/random-team-generator' },
        { key: 'random-team-generator', locale: 'ja', path: '/ja/random-team-generator' },
        { key: 'random-team-generator', locale: 'hi', path: '/hi/random-team-generator' },
        { key: 'random-team-generator', locale: 'zh', path: '/zh/random-team-generator' },
      ]),
    );
    expect(TOOL_PAGE_ROUTES).not.toEqual(
      expect.arrayContaining([{ key: 'team-shuffle-generator', locale: 'es', path: '/es/team-shuffle-generator' }]),
    );
  });

  it('emits locale alternates plus x-default for localized pages', () => {
    const config = getToolPageConfig('random-team-generator', 'zh');

    expect(config.canonicalPath).toBe('/zh/random-team-generator');
    expect(config.alternates).toEqual([
      { hreflang: 'en', canonicalPath: '/random-team-generator' },
      { hreflang: 'es', canonicalPath: '/es/random-team-generator' },
      { hreflang: 'fr', canonicalPath: '/fr/random-team-generator' },
      { hreflang: 'ja', canonicalPath: '/ja/random-team-generator' },
      { hreflang: 'hi', canonicalPath: '/hi/random-team-generator' },
      { hreflang: 'zh-Hans', canonicalPath: '/zh/random-team-generator' },
      { hreflang: 'x-default', canonicalPath: '/random-team-generator' },
    ]);
  });
});
