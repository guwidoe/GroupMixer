import { BookOpenText } from 'lucide-react';
import { useMemo } from 'react';
import { LandingGuideCard, type LandingGuideCardLink } from './LandingGuideCard';
import { DEFAULT_LOCALE, type SupportedLocale } from '../../pages/toolPageConfigs';
import { GUIDE_PAGE_ROUTES, getGuidePageConfig } from '../../pages/guidePageConfigs';

interface LandingGuidesSectionProps {
  locale: SupportedLocale;
}

export function LandingGuidesSection({ locale }: LandingGuidesSectionProps) {
  const guideTopics = ['All', 'Workshops', 'Classrooms', 'Networking', 'Constraints', 'Pairs', 'Breakouts', 'Teams'];
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

  return (
    <section
      id="guides"
      className="border-t px-4 py-12 sm:px-6 lg:py-16"
      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="flex items-center justify-center gap-3">
            <div
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-accent) 35%, var(--border-primary) 65%)',
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, var(--bg-primary) 90%)',
                color: 'var(--color-accent)',
              }}
              aria-hidden="true"
            >
              <BookOpenText className="h-6 w-6" />
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">Guides</h2>
          </div>
          <p className="mt-3 text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
            Practical playbooks for workshops, classrooms, and repeated group assignments.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Guide topics">
          {guideTopics.map((topic, index) => (
            <span
              key={topic}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium"
              style={{
                borderColor: index === 0
                  ? 'color-mix(in srgb, var(--color-accent) 42%, var(--border-primary) 58%)'
                  : 'var(--border-primary)',
                backgroundColor: index === 0
                  ? 'color-mix(in srgb, var(--color-accent) 12%, var(--bg-primary) 88%)'
                  : 'var(--bg-primary)',
                color: index === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {topic}
            </span>
          ))}
        </div>

        <div className="mt-10 grid min-w-0 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {guideLinks.map((guide) => (
            <LandingGuideCard key={guide.key} guide={guide} />
          ))}
        </div>
      </div>
    </section>
  );
}
