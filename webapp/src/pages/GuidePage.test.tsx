import { render, screen } from '@testing-library/react';
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

  it.each(GUIDE_CASES)('renders guide SEO metadata and CTA for $route.key', ({ config }) => {
    render(
      <MemoryRouter initialEntries={[config.canonicalPath]}>
        <GuidePage pageKey={config.key} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: config.hero.title })).toBeInTheDocument();
    expect(screen.getByText(config.problem.title)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: config.cta.buttonLabel })).toHaveAttribute('href', config.cta.href);
    expect(document.title).toBe(config.seo.title);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(config.seo.description);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${CANONICAL_ORIGIN}${config.canonicalPath}`,
    );
    expect(document.getElementById('groupmixer-route-schema')?.textContent ?? '').toBe('');
  });
});
