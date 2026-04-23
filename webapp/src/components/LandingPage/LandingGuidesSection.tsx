import { BookOpenText } from 'lucide-react';
import { useMemo } from 'react';
import { LandingGuideCard, type LandingGuideCardLink } from './LandingGuideCard';
import { DEFAULT_LOCALE, type SupportedLocale } from '../../pages/toolPageConfigs';
import { GUIDE_PAGE_ROUTES, getGuidePageConfig } from '../../pages/guidePageConfigs';

interface LandingGuidesSectionProps {
  locale: SupportedLocale;
}

export function LandingGuidesSection({ locale }: LandingGuidesSectionProps) {
  const guideLinks = useMemo<LandingGuideCardLink[]>(() => {
    if (locale !== DEFAULT_LOCALE) {
      return [];
    }

    return GUIDE_PAGE_ROUTES.map((route) => {
      const guideConfig = getGuidePageConfig(route.key);
      return {
        key: route.key,
        href: guideConfig.canonicalPath,
        title: guideConfig.hero.title,
        description: guideConfig.hero.intro,
      };
    });
  }, [locale]);

  if (guideLinks.length === 0) {
    return null;
  }

  const [featuredGuide, ...supportingGuides] = guideLinks;

  return (
    <section
      className="border-t px-4 py-12 sm:px-6 lg:py-14"
      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.5fr)] lg:items-start">
        <div className="min-w-0">
          <div
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-accent) 35%, var(--border-primary) 65%)',
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, var(--bg-primary) 90%)',
              color: 'var(--color-accent)',
            }}
            aria-hidden="true"
          >
            <BookOpenText className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">Guides</h2>
          <p className="mt-3 max-w-xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
            Practical playbooks for workshops, classrooms, and repeated group assignments.
          </p>
          <div
            className="mt-6 grid grid-cols-3 divide-x divide-[var(--border-primary)] overflow-hidden rounded-lg border text-center"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            aria-label="Guide library summary"
          >
            <div className="px-3 py-3">
              <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {guideLinks.length}
              </div>
              <div className="mt-0.5 text-xs font-medium">topics</div>
            </div>
            <div className="px-3 py-3">
              <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                3
              </div>
              <div className="mt-0.5 text-xs font-medium">settings</div>
            </div>
            <div className="px-3 py-3">
              <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                1
              </div>
              <div className="mt-0.5 text-xs font-medium">tool</div>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <LandingGuideCard guide={featuredGuide} featured />
          {supportingGuides.map((guide) => (
            <LandingGuideCard key={guide.key} guide={guide} />
          ))}
        </div>
      </div>
    </section>
  );
}
