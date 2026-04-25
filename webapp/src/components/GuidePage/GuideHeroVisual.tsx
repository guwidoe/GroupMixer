import type { CSSProperties, ReactNode } from 'react';
import type { GuidePageKey } from '../../pages/guidePageTypes';

type VisualPattern = 'rounds' | 'networking' | 'classroom' | 'compare' | 'pairs' | 'rooms' | 'teams';

interface GuideHeroVisualProps {
  pageKey: GuidePageKey;
}

interface GuideVisualContent {
  title: string;
  subtitle: string;
  pattern: VisualPattern;
  labels: string[];
  badges: string[];
  accent: string;
  secondary: string;
}

const GUIDE_VISUAL_CONTENT: Record<GuidePageKey, GuideVisualContent> = {
  'avoid-repeat-pairings-in-workshops': {
    title: 'Fresh table rotations',
    subtitle: 'Repeated rounds with fewer repeated pairings.',
    pattern: 'rounds',
    labels: ['Round 1', 'Round 2', 'Round 3', 'Round 4'],
    badges: ['24 people', 'groups of 4', 'avoid repeats'],
    accent: '#2563eb',
    secondary: '#14b8a6',
  },
  'run-speed-networking-rounds': {
    title: 'New conversations each round',
    subtitle: 'Short rounds optimized for fresh contacts.',
    pattern: 'networking',
    labels: ['1', '2', '3', '4', '5'],
    badges: ['30 attendees', 'groups of 3', '5 rounds'],
    accent: '#0ea5e9',
    secondary: '#f59e0b',
  },
  'make-balanced-student-groups': {
    title: 'Balanced project groups',
    subtitle: 'Students spread by useful classroom attributes.',
    pattern: 'classroom',
    labels: ['Skill', 'Support', 'Focus', 'Leaders'],
    badges: ['28 students', 'groups of 4', 'skill balance'],
    accent: '#7c3aed',
    secondary: '#22c55e',
  },
  'random-vs-balanced-vs-constrained-groups': {
    title: 'Choose the right grouping mode',
    subtitle: 'From quick random splits to rule-aware schedules.',
    pattern: 'compare',
    labels: ['Random', 'Balanced', 'Constrained'],
    badges: ['simple', 'balanced', 'rules'],
    accent: '#2563eb',
    secondary: '#f43f5e',
  },
  'split-a-class-into-fair-groups': {
    title: 'Fair classroom groups',
    subtitle: 'Workable groups that account for class dynamics.',
    pattern: 'classroom',
    labels: ['Confidence', 'Reading', 'Dynamics', 'Helpers'],
    badges: ['26 students', 'fair sizes', 'apart rules'],
    accent: '#16a34a',
    secondary: '#f59e0b',
  },
  'make-random-pairs-from-a-list': {
    title: 'Pair rotations',
    subtitle: 'Partner work with fewer repeated pairs.',
    pattern: 'pairs',
    labels: ['Round 1', 'Round 2', 'Round 3'],
    badges: ['pairs', 'odd counts', 'repeat control'],
    accent: '#db2777',
    secondary: '#2563eb',
  },
  'assign-breakout-rooms-for-online-workshops': {
    title: 'Breakout room planning',
    subtitle: 'Room assignments for repeated online sessions.',
    pattern: 'rooms',
    labels: ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5', 'Room 6'],
    badges: ['6 rooms', '3 rounds', 'room hosts'],
    accent: '#0891b2',
    secondary: '#7c3aed',
  },
  'create-balanced-random-teams': {
    title: 'Balanced random teams',
    subtitle: 'Fast team splits with a healthier role mix.',
    pattern: 'teams',
    labels: ['Engineering', 'Design', 'Product', 'Data'],
    badges: ['24 people', '4 teams', 'role mix'],
    accent: '#ea580c',
    secondary: '#2563eb',
  },
};

const palette = ['#2563eb', '#14b8a6', '#f59e0b', '#7c3aed', '#ef4444', '#06b6d4', '#84cc16'];

function mix(color: string, amount: number) {
  return `color-mix(in srgb, ${color} ${amount}%, var(--bg-primary) ${100 - amount}%)`;
}

function cardStyle(accent: string): CSSProperties {
  return {
    borderColor: 'color-mix(in srgb, var(--border-primary) 80%, transparent)',
    backgroundColor: `color-mix(in srgb, ${accent} 6%, var(--bg-primary) 94%)`,
  };
}

function personDots(count: number, offset = 0) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="h-3.5 w-3.5 rounded-full border"
          style={{
            backgroundColor: mix(palette[(index + offset) % palette.length], 72),
            borderColor: 'color-mix(in srgb, white 42%, transparent)',
          }}
        />
      ))}
    </div>
  );
}

function miniRosterRows(rows: number, offset = 0) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2">
          <span
            className="h-5 w-5 rounded-full"
            style={{ backgroundColor: mix(palette[(index + offset) % palette.length], 30) }}
          />
          <span
            className="h-2.5 flex-1 rounded-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--text-tertiary) 18%, transparent)' }}
          />
        </div>
      ))}
    </div>
  );
}

function renderRoundCards(content: GuideVisualContent) {
  return (
    <div className="grid h-full gap-3 sm:grid-cols-2">
      {content.labels.map((label, index) => (
        <div key={label} className="rounded-lg border p-3" style={cardStyle(index % 2 === 0 ? content.accent : content.secondary)}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{label}</span>
            <span className="h-2 w-12 rounded-full" style={{ backgroundColor: mix(index % 2 === 0 ? content.accent : content.secondary, 52) }} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            {personDots(4, index)}
          </div>
          <div className="mt-4">{miniRosterRows(2, index + 2)}</div>
        </div>
      ))}
    </div>
  );
}

function renderNetworking(content: GuideVisualContent) {
  return (
    <div className="flex h-full items-center justify-between gap-3">
      {content.labels.map((label, index) => (
        <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-4">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold"
            style={{
              borderColor: mix(content.accent, 48),
              backgroundColor: mix(index % 2 === 0 ? content.accent : content.secondary, 18),
              color: 'var(--text-primary)',
            }}
          >
            {label}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            {personDots(3, index)}
          </div>
          <span
            className="hidden h-16 w-px rounded-full sm:block"
            style={{ background: `linear-gradient(${content.accent}, ${content.secondary})` }}
          />
        </div>
      ))}
    </div>
  );
}

function renderClassroom(content: GuideVisualContent) {
  return (
    <div className="grid h-full gap-3 sm:grid-cols-2">
      {content.labels.map((label, index) => (
        <div key={label} className="rounded-lg border p-3" style={cardStyle(index % 2 === 0 ? content.accent : content.secondary)}>
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold">{label}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              mix
            </span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }, (_, dotIndex) => (
              <span
                key={dotIndex}
                className="aspect-square rounded-full"
                style={{ backgroundColor: mix(palette[(dotIndex + index) % palette.length], dotIndex % 3 === 0 ? 78 : 26) }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderCompare(content: GuideVisualContent) {
  return (
    <div className="grid h-full gap-3 sm:grid-cols-3">
      {content.labels.map((label, index) => (
        <div key={label} className="rounded-lg border p-3" style={cardStyle(palette[index])}>
          <p className="text-sm font-semibold">{label}</p>
          <div className="mt-5 space-y-2.5">
            {Array.from({ length: 5 }, (_, rowIndex) => (
              <div key={rowIndex} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: mix(palette[(rowIndex + index) % palette.length], 72) }}
                />
                <span
                  className={[
                    'h-2 rounded-full',
                    index === 0 ? ['w-10', 'w-16', 'w-8', 'w-20', 'w-12'][rowIndex] : 'w-full',
                  ].join(' ')}
                  style={{ backgroundColor: index === 2 && rowIndex > 2 ? mix(content.secondary, 40) : 'color-mix(in srgb, var(--text-tertiary) 18%, transparent)' }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderPairs(content: GuideVisualContent) {
  return (
    <div className="grid h-full gap-3">
      {content.labels.map((label, index) => (
        <div key={label} className="rounded-lg border p-3" style={cardStyle(index % 2 === 0 ? content.accent : content.secondary)}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{label}</span>
            <span className="h-2 w-20 rounded-full" style={{ backgroundColor: mix(index % 2 === 0 ? content.accent : content.secondary, 48) }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }, (_, pairIndex) => (
              <div key={pairIndex} className="flex items-center justify-center gap-1.5 rounded-full border px-2 py-1.5" style={{ borderColor: 'var(--border-primary)' }}>
                {personDots(2, index + pairIndex)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderRooms(content: GuideVisualContent) {
  return (
    <div className="grid h-full gap-3 sm:grid-cols-3">
      {content.labels.map((label, index) => (
        <div key={label} className="rounded-lg border p-3" style={cardStyle(index % 2 === 0 ? content.accent : content.secondary)}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{label}</span>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: mix(content.accent, 82) }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {Array.from({ length: 4 }, (_, tileIndex) => (
              <span
                key={tileIndex}
                className="aspect-video rounded"
                style={{ backgroundColor: mix(palette[(index + tileIndex) % palette.length], tileIndex === 0 ? 62 : 20) }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderTeams(content: GuideVisualContent) {
  return (
    <div className="grid h-full gap-3 sm:grid-cols-2">
      {content.labels.map((label, index) => (
        <div key={label} className="rounded-lg border p-3" style={cardStyle(palette[index])}>
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold">{label}</span>
            <span className="rounded-full px-2 py-0.5 text-[0.7rem] font-semibold" style={{ backgroundColor: mix(palette[index], 24), color: 'var(--text-secondary)' }}>
              lead
            </span>
          </div>
          <div className="mt-4">{miniRosterRows(3, index)}</div>
        </div>
      ))}
    </div>
  );
}

function renderScene(content: GuideVisualContent): ReactNode {
  switch (content.pattern) {
    case 'networking':
      return renderNetworking(content);
    case 'classroom':
      return renderClassroom(content);
    case 'compare':
      return renderCompare(content);
    case 'pairs':
      return renderPairs(content);
    case 'rooms':
      return renderRooms(content);
    case 'teams':
      return renderTeams(content);
    case 'rounds':
    default:
      return renderRoundCards(content);
  }
}

export function GuideHeroVisual({ pageKey }: GuideHeroVisualProps) {
  const content = GUIDE_VISUAL_CONTENT[pageKey];

  return (
    <figure
      className="overflow-hidden rounded-lg border"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 72%, var(--bg-primary) 28%)',
        boxShadow: 'var(--shadow-lg)',
      }}
      aria-label={`${content.title}: ${content.subtitle}`}
    >
      <div className="grid min-h-[23rem] md:grid-cols-[minmax(0,1fr)_minmax(17rem,0.45fr)]">
        <div
          className="relative overflow-hidden border-b p-5 md:border-b-0 md:border-r sm:p-7"
          style={{
            borderColor: 'var(--border-primary)',
            background:
              `radial-gradient(circle at 18% 18%, color-mix(in srgb, ${content.accent} 24%, transparent) 0, transparent 32%), ` +
              `radial-gradient(circle at 82% 74%, color-mix(in srgb, ${content.secondary} 22%, transparent) 0, transparent 34%), ` +
              'linear-gradient(135deg, color-mix(in srgb, var(--bg-primary) 92%, transparent), color-mix(in srgb, var(--bg-secondary) 96%, transparent))',
          }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
          <div className="relative h-full min-h-[17rem]">{renderScene(content)}</div>
        </div>

        <figcaption className="flex flex-col justify-between gap-8 p-5 sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
              Guide visual
            </p>
            <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-normal">{content.title}</h2>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {content.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {content.badges.map((badge, index) => (
              <span
                key={badge}
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{
                  borderColor: 'var(--border-primary)',
                  backgroundColor: mix(index % 2 === 0 ? content.accent : content.secondary, 10),
                  color: 'var(--text-secondary)',
                }}
              >
                {badge}
              </span>
            ))}
          </div>
        </figcaption>
      </div>
    </figure>
  );
}
