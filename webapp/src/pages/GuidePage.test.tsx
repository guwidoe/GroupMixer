import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GuidePage from './GuidePage';
import { getGuidePageConfig, GUIDE_PAGE_ROUTES } from './guidePageConfigs';
import { CANONICAL_ORIGIN } from '../seo/seoDocument';

const GUIDE_CASES = GUIDE_PAGE_ROUTES.map((route) => ({
  route,
  config: getGuidePageConfig(route.key),
}));

describe('GuidePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it.each(GUIDE_CASES)('renders guide SEO metadata for $route.key', ({ config }) => {
    render(
      <MemoryRouter initialEntries={[config.canonicalPath]}>
        <GuidePage pageKey={config.key} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: config.hero.title })).toBeInTheDocument();
    expect(screen.getByText(config.problem.title)).toBeInTheDocument();
    expect(document.title).toBe(config.seo.title);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(config.seo.description);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${CANONICAL_ORIGIN}${config.canonicalPath}`,
    );
    expect(document.getElementById('groupmixer-route-schema')?.textContent ?? '').toBe('');
  });

  it('keeps guide cross-links inside the guide system', () => {
    for (const { config } of GUIDE_CASES) {
      const links = [
        ...(config.cta ? [config.cta.href] : []),
        ...(config.relatedTools?.links.map((link) => link.href) ?? []),
        ...(config.relatedGuides?.links.map((link) => link.href) ?? []),
      ];

      expect(links.every((href) => href.startsWith('/guides/'))).toBe(true);
    }
  });

  it('embeds the shared tool with the current guide example and isolated storage', async () => {
    const config = getGuidePageConfig('run-speed-networking-rounds');

    render(
      <MemoryRouter initialEntries={[config.canonicalPath]}>
        <GuidePage pageKey={config.key} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Try this setup in GroupMixer' })).toBeInTheDocument();

    await waitFor(() => {
      const storedDraft = JSON.parse(
        window.localStorage.getItem('groupmixer.quick-setup.home.guide.run-speed-networking-rounds.v1') ?? '{}',
      ) as { sessions?: number; participantColumns?: Array<{ values?: string }> };
      expect(storedDraft.sessions).toBe(5);
      expect(storedDraft.participantColumns?.[0]?.values).toContain('Amelia Grant');
      expect(storedDraft.participantColumns?.[0]?.values).toContain('Mateo Silva');
    });
    expect(window.localStorage.getItem('groupmixer.quick-setup.home.v1')).toBeNull();
  });
});
