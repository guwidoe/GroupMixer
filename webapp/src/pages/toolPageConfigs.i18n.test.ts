import { describe, expect, it } from 'vitest';
import {
  buildToolPagePath,
  DEFAULT_LOCALE,
  getLocaleHomePath,
  getToolPageConfig,
  TOOL_PAGE_ROUTES,
} from './toolPageConfigs';

describe('toolPageConfigs locale routing', () => {
  it('keeps English unprefixed and builds prefixed locale home routes', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(getLocaleHomePath('en')).toBe('/');
    expect(getLocaleHomePath('de')).toBe('/de');
    expect(getLocaleHomePath('es')).toBe('/es');
    expect(getLocaleHomePath('fr')).toBe('/fr');
    expect(getLocaleHomePath('ja')).toBe('/ja');
    expect(getLocaleHomePath('hi')).toBe('/hi');
    expect(getLocaleHomePath('zh')).toBe('/zh');
    expect(buildToolPagePath('en', 'home', '')).toBe('/');
    expect(buildToolPagePath('de', 'home', '')).toBe('/de');
  });

  it('registers only the locale-prefixed home routes', () => {
    expect(TOOL_PAGE_ROUTES).toEqual([
      { key: 'home', locale: 'en', path: '/' },
      { key: 'home', locale: 'de', path: '/de' },
      { key: 'home', locale: 'es', path: '/es' },
      { key: 'home', locale: 'fr', path: '/fr' },
      { key: 'home', locale: 'ja', path: '/ja' },
      { key: 'home', locale: 'hi', path: '/hi' },
      { key: 'home', locale: 'zh', path: '/zh' },
    ]);
  });

  it('emits locale alternates plus x-default for home', () => {
    const config = getToolPageConfig('home', 'zh');

    expect(config.canonicalPath).toBe('/zh');
    expect(config.alternates).toEqual([
      { hreflang: 'en', canonicalPath: '/' },
      { hreflang: 'de', canonicalPath: '/de' },
      { hreflang: 'es', canonicalPath: '/es' },
      { hreflang: 'fr', canonicalPath: '/fr' },
      { hreflang: 'ja', canonicalPath: '/ja' },
      { hreflang: 'hi', canonicalPath: '/hi' },
      { hreflang: 'zh-Hans', canonicalPath: '/zh' },
      { hreflang: 'x-default', canonicalPath: '/' },
    ]);
  });
});
