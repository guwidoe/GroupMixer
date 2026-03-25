import { useMemo, useState } from 'react';
import { ArrowRight, Compass, Layers3, Wand2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { TOOL_PAGE_CONFIGS, type ToolPageKey } from './toolPageConfigs';

type GroupMode = 'count' | 'size';

interface ToolLandingPageProps {
  pageKey: ToolPageKey;
}

function parseParticipants(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export default function ToolLandingPage({ pageKey }: ToolLandingPageProps) {
  const config = TOOL_PAGE_CONFIGS[pageKey];
  const [participantInput, setParticipantInput] = useState('Alex\nSam\nPriya\nJordan\nMina\nLuis\nTaylor\nCasey');
  const [groupMode, setGroupMode] = useState<GroupMode>('count');
  const [groupValue, setGroupValue] = useState(4);

  const participants = useMemo(() => parseParticipants(participantInput), [participantInput]);
  const participantCount = participants.length;
  const estimatedGroupCount =
    groupMode === 'count'
      ? Math.max(1, groupValue)
      : Math.max(1, Math.ceil(participantCount / Math.max(1, groupValue)));
  const estimatedGroupSize =
    groupMode === 'size'
      ? Math.max(1, groupValue)
      : Math.max(1, Math.ceil(participantCount / Math.max(1, groupValue)));

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <header
        className="border-b"
        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="GroupMixer logo" className="h-9 w-9" />
            <div>
              <div className="text-lg font-semibold tracking-tight">GroupMixer</div>
              <div className="text-xs uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)' }}>
                Tool-first grouping
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="hidden rounded-full border px-4 py-2 text-sm font-medium transition-colors sm:inline-flex"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            >
              Open expert workspace
            </Link>
            <a
              href="https://github.com/guwidoe/GroupMixer/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              Feedback
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 pb-14 pt-10 sm:px-6 lg:px-8 lg:pb-20 lg:pt-16">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,480px)] lg:items-start">
            <div className="max-w-2xl">
              <div
                className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.22em]"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                <Wand2 className="h-3.5 w-3.5" />
                {config.defaultPreset} preset
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                {config.h1}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8" style={{ color: 'var(--text-secondary)' }}>
                {config.subhead}
              </p>
              <p className="mt-6 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                {config.intro}
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    icon: Compass,
                    title: 'Quick first draft',
                    body: 'Start with names and rough sizing before deciding whether the session needs advanced controls.',
                  },
                  {
                    icon: Layers3,
                    title: 'Layered complexity',
                    body: 'Keep the first screen calm, then move into the expert /app workspace when the setup becomes more serious.',
                  },
                  {
                    icon: ArrowRight,
                    title: 'One product model',
                    body: 'The landing route and the advanced app are being aligned so they flow into the same backend-facing structure.',
                  },
                ].map(({ icon: Icon, title, body }) => (
                  <div
                    key={title}
                    className="rounded-3xl border p-5"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
                  >
                    <Icon className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
                    <h2 className="mt-4 text-base font-semibold">{title}</h2>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <aside
              className="rounded-[2rem] border p-6 shadow-sm"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
                    Quick setup shell
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Plan the first pass</h2>
                </div>
                <div
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  Local draft only
                </div>
              </div>

              <div className="mt-6 space-y-5">
                <div>
                  <label htmlFor="participants" className="mb-2 block text-sm font-medium">
                    Participants
                  </label>
                  <textarea
                    id="participants"
                    value={participantInput}
                    onChange={(event) => setParticipantInput(event.target.value)}
                    placeholder="One name per line"
                    className="min-h-[180px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-shadow focus:ring-2"
                    style={{
                      borderColor: 'var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Keep this draft local while typing. A later action can move it into the advanced workspace.
                  </p>
                </div>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Grouping mode</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { value: 'count' as const, label: 'Target group count' },
                      { value: 'size' as const, label: 'Target group size' },
                    ].map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3"
                        style={{
                          borderColor:
                            groupMode === option.value ? 'var(--color-accent)' : 'var(--border-primary)',
                          backgroundColor: 'var(--bg-secondary)',
                        }}
                      >
                        <input
                          type="radio"
                          name="groupMode"
                          value={option.value}
                          checked={groupMode === option.value}
                          onChange={() => setGroupMode(option.value)}
                        />
                        <span className="text-sm font-medium">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="groupValue" className="mb-2 block text-sm font-medium">
                    {groupMode === 'count' ? 'How many groups?' : 'How many people per group?'}
                  </label>
                  <input
                    id="groupValue"
                    type="number"
                    min={1}
                    value={groupValue}
                    onChange={(event) => setGroupValue(Math.max(1, Number(event.target.value) || 1))}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-shadow focus:ring-2"
                    style={{
                      borderColor: 'var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div
                className="mt-6 rounded-3xl border p-4"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="text-sm font-medium">Live draft summary</div>
                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt style={{ color: 'var(--text-secondary)' }}>Participants</dt>
                    <dd className="mt-1 text-2xl font-semibold">{participantCount}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-secondary)' }}>Estimated groups</dt>
                    <dd className="mt-1 text-2xl font-semibold">{estimatedGroupCount}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-secondary)' }}>Estimated size</dt>
                    <dd className="mt-1 text-2xl font-semibold">{estimatedGroupSize}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-secondary)' }}>Route intent</dt>
                    <dd className="mt-1 text-base font-semibold capitalize">{config.defaultPreset}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/app"
                  className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  Open advanced workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/app/problem/people"
                  className="inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold"
                  style={{ borderColor: 'var(--border-primary)' }}
                >
                  Go straight to people setup
                </Link>
              </div>
            </aside>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,360px)]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Why this route exists</h2>
              <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                Search visitors should arrive on a page that behaves like a grouping tool immediately. This shell keeps the first interaction simple while preserving the full expert cockpit under <code>/app</code>.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
              <div className="mt-4 space-y-4">
                {config.faqEntries.map((entry) => (
                  <div
                    key={entry.question}
                    className="rounded-2xl border p-4"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
                  >
                    <h3 className="text-base font-semibold">{entry.question}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {entry.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
