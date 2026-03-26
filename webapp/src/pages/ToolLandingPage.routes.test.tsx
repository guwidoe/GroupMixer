import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CANONICAL_ORIGIN } from '../seo/seoDocument';
import { useAppStore } from '../store';
import ToolLandingPage from './ToolLandingPage';
import { TOOL_PAGE_CONFIGS, TOOL_PAGE_ROUTES, type ToolPageConfig, type ToolPageKey } from './toolPageConfigs';

const ROUTE_CASES = Object.entries(TOOL_PAGE_CONFIGS) as Array<[ToolPageKey, ToolPageConfig]>;

describe('ToolLandingPage route inventory', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.__groupmixerLandingEvents = [];
    useAppStore.getState().reset();
  });

  it('keeps route registration aligned with the validated config registry', () => {
    expect(TOOL_PAGE_ROUTES).toEqual(
      ROUTE_CASES.map(([key, config]) => ({
        key,
        path: config.canonicalPath,
      })),
    );
  });

  it.each(ROUTE_CASES)('renders lightweight SEO assertions for %s', async (pageKey, config) => {
    render(
      <MemoryRouter initialEntries={[config.canonicalPath]}>
        <ToolLandingPage pageKey={pageKey} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: config.hero.title,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(config.hero.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(config.hero.audienceSummary)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: config.optimizerCta.title })).toBeInTheDocument();
    expect(document.title).toBe(config.seo.title);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(config.seo.description);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${CANONICAL_ORIGIN}${config.canonicalPath === '/' ? '/' : config.canonicalPath}`,
    );
    expect(document.getElementById('groupmixer-route-schema')?.textContent).toContain('FAQPage');
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'landing_view',
          payload: expect.objectContaining({
            pageKey,
            canonicalPath: config.canonicalPath,
            pageExperimentLabel: config.experiment.label,
          }),
        }),
      ]),
    );
  });
});
