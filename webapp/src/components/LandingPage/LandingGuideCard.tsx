import { ArrowRight, BriefcaseBusiness, GitBranch, GraduationCap, Handshake, MonitorUp, Network, Shuffle, UsersRound } from 'lucide-react';
import { type ComponentType, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { GuidePageKey } from '../../pages/guidePageConfigs';

export interface LandingGuideCardLink {
  key: GuidePageKey;
  href: string;
  title: string;
  description: string;
}

const GUIDE_ICON_BY_KEY: Record<GuidePageKey, ComponentType<{ className?: string }>> = {
  'avoid-repeat-pairings-in-workshops': Network,
  'run-speed-networking-rounds': UsersRound,
  'make-balanced-student-groups': GraduationCap,
  'random-vs-balanced-vs-constrained-groups': GitBranch,
  'split-a-class-into-fair-groups': Shuffle,
  'make-random-pairs-from-a-list': Handshake,
  'assign-breakout-rooms-for-online-workshops': MonitorUp,
  'create-balanced-random-teams': BriefcaseBusiness,
};

interface LandingGuideCardProps {
  guide: LandingGuideCardLink;
  featured?: boolean;
}

export function LandingGuideCard({ guide, featured = false }: LandingGuideCardProps) {
  const Icon = GUIDE_ICON_BY_KEY[guide.key];

  return (
    <Link
      to={guide.href}
      className={[
        'landing-guide-card group relative min-w-0 overflow-hidden rounded-lg border p-5 transition',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        featured ? 'lg:col-span-2 lg:p-6' : '',
      ].join(' ')}
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: featured ? 'var(--bg-secondary)' : 'var(--bg-primary)',
        color: 'var(--text-primary)',
        boxShadow: 'var(--shadow)',
        '--tw-ring-color': 'var(--color-accent)',
        '--tw-ring-offset-color': 'var(--bg-primary)',
      } as CSSProperties}
    >
      <span
        className="landing-guide-card__bar absolute inset-x-0 top-0 h-1 transition-all"
        style={{ backgroundColor: 'var(--color-accent)' }}
        aria-hidden="true"
      />
      <div className={featured ? 'flex h-full flex-col' : ''}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="landing-guide-card__icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-accent) 28%, var(--border-primary) 72%)',
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, var(--bg-primary) 92%)',
                color: 'var(--color-accent)',
              }}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </div>
            <h3 className={featured ? 'min-w-0 pt-1 text-xl font-semibold leading-tight' : 'min-w-0 pt-1 text-base font-semibold leading-tight'}>
              {guide.title}
            </h3>
          </div>
          <ArrowRight
            className="landing-guide-card__arrow mt-1 h-4 w-4 shrink-0 transition"
            style={{ color: 'var(--text-tertiary)' }}
            aria-hidden="true"
          />
        </div>
        <p className={featured ? 'mt-3 text-sm leading-7' : 'mt-3 text-sm leading-6'} style={{ color: 'var(--text-secondary)' }}>
          {guide.description}
        </p>
        <span
          className={[
            'landing-guide-card__link-label inline-flex text-sm font-semibold transition-colors',
            featured ? 'mt-6' : 'mt-4',
          ].join(' ')}
          style={{ color: 'var(--color-accent)' }}
        >
          Read guide
        </span>
      </div>
    </Link>
  );
}
