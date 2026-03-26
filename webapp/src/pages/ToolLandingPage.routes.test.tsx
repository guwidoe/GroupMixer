import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CANONICAL_ORIGIN } from '../seo/seoDocument';
import { useAppStore } from '../store';
import ToolLandingPage from './ToolLandingPage';
import { getLocaleHrefLang, getToolPageConfig, TOOL_PAGE_ROUTES } from './toolPageConfigs';

const ROUTE_CASES = TOOL_PAGE_ROUTES.map((route) => ({
  route,
  config: getToolPageConfig(route.key, route.locale),
}));

describe('ToolLandingPage route inventory', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.__groupmixerLandingEvents = [];
    useAppStore.getState().reset();
  });

  it('keeps route registration aligned with the validated config registry', () => {
    expect(TOOL_PAGE_ROUTES).toEqual(
      ROUTE_CASES.map(({ route, config }) => ({
        key: route.key,
        locale: route.locale,
        path: config.canonicalPath,
      })),
    );
  });

  it.each(ROUTE_CASES)('renders lightweight SEO assertions for $route.locale:$route.key', async ({ route, config }) => {
    const defaultAlternate = config.alternates[config.alternates.length - 1];

    render(
      <MemoryRouter initialEntries={[config.canonicalPath]}>
        <ToolLandingPage pageKey={route.key} locale={route.locale} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: config.hero.title,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(config.hero.eyebrow)).toBeInTheDocument();
    if (config.hero.audienceSummary) {
      expect(screen.getByText(config.hero.audienceSummary)).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { level: 2, name: config.optimizerCta.title })).toBeInTheDocument();
    expect(document.title).toBe(config.seo.title);
    expect(document.documentElement.lang).toBe(getLocaleHrefLang(route.locale));
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(config.seo.description);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${CANONICAL_ORIGIN}${config.canonicalPath === '/' ? '/' : config.canonicalPath}`,
    );
    expect(document.querySelector('link[rel="alternate"][hreflang="en"]')?.getAttribute('href')).toBe(
      `${CANONICAL_ORIGIN}${config.alternates[0]?.canonicalPath === '/' ? '/' : config.alternates[0]?.canonicalPath}`,
    );
    expect(document.querySelector('link[rel="alternate"][hreflang="x-default"]')?.getAttribute('href')).toBe(
      `${CANONICAL_ORIGIN}${defaultAlternate?.canonicalPath === '/' ? '/' : defaultAlternate?.canonicalPath}`,
    );
    expect(document.getElementById('groupmixer-route-schema')?.textContent).toContain('FAQPage');
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'landing_view',
          payload: expect.objectContaining({
            pageKey: route.key,
            locale: route.locale,
            canonicalPath: config.canonicalPath,
            pageExperimentLabel: config.experiment.label,
          }),
        }),
      ]),
    );
  });
});
