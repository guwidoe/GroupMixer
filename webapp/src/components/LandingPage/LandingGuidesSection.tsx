import { BookOpenText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LandingGuideCard, type LandingGuideCardLink } from './LandingGuideCard';
import { DEFAULT_LOCALE, type SupportedLocale } from '../../pages/toolPageConfigs';
import { GUIDE_PAGE_ROUTES, getGuidePageConfig } from '../../pages/guidePageConfigs';
import type { GuidePageKey } from '../../pages/guidePageTypes';

interface LandingGuidesSectionProps {
  locale: SupportedLocale;
}

type GuideTopic = 'All' | 'Workshops' | 'Classrooms' | 'Networking' | 'Constraints' | 'Pairs' | 'Breakouts' | 'Teams';

const GUIDE_TOPICS: GuideTopic[] = ['All', 'Workshops', 'Classrooms', 'Networking', 'Constraints', 'Pairs', 'Breakouts', 'Teams'];

const GUIDE_TOPICS_BY_KEY: Record<GuidePageKey, Exclude<GuideTopic, 'All'>[]> = {
  'avoid-repeat-pairings-in-workshops': ['Workshops', 'Networking', 'Constraints'],
  'run-speed-networking-rounds': ['Networking'],
  'make-balanced-student-groups': ['Classrooms', 'Teams'],
  'random-vs-balanced-vs-constrained-groups': ['Constraints', 'Workshops', 'Teams'],
  'split-a-class-into-fair-groups': ['Classrooms'],
  'make-random-pairs-from-a-list': ['Pairs', 'Classrooms'],
  'assign-breakout-rooms-for-online-workshops': ['Breakouts', 'Workshops'],
  'create-balanced-random-teams': ['Teams'],
};

export function LandingGuidesSection({ locale }: LandingGuidesSectionProps) {
  const [activeTopic, setActiveTopic] = useState<GuideTopic>('All');
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
  const visibleGuideLinks = useMemo(
    () => activeTopic === 'All'
      ? guideLinks
      : guideLinks.filter((guide) => GUIDE_TOPICS_BY_KEY[guide.key].includes(activeTopic)),
    [activeTopic, guideLinks],
  );

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
          {GUIDE_TOPICS.map((topic) => {
            const isActive = activeTopic === topic;

            return (
              <button
                key={topic}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveTopic(topic)}
                className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium"
                style={{
                  borderColor: isActive
                    ? 'color-mix(in srgb, var(--color-accent) 42%, var(--border-primary) 58%)'
                    : 'var(--border-primary)',
                  backgroundColor: isActive
                    ? 'color-mix(in srgb, var(--color-accent) 12%, var(--bg-primary) 88%)'
                    : 'var(--bg-primary)',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {topic}
              </button>
            );
          })}
        </div>

        <div className="mt-10 grid min-w-0 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleGuideLinks.map((guide) => (
            <LandingGuideCard key={guide.key} guide={guide} />
          ))}
        </div>
      </div>
    </section>
  );
}
