import { ArrowRight, ChevronDown, Download, RotateCcw, Sparkles, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QuickSetupFaq } from '../components/LandingTool/QuickSetupFaq';
import { QuickSetupAdvancedOptions } from '../components/LandingTool/QuickSetupAdvancedOptions';
import { useQuickSetup } from '../components/LandingTool/useQuickSetup';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { Seo } from '../components/Seo';
import { trackLandingEvent } from '../services/landingInstrumentation';
import { useAppStore } from '../store';
import { ThemeToggle } from '../components/ThemeToggle';
import { ResultsScheduleGrid } from '../components/ResultsView/ResultsScheduleGrid';
import { buildResultsSessionData } from '../components/results/buildResultsViewModel';
import { TOOL_PAGE_CONFIGS, type ToolPageKey } from './toolPageConfigs';

interface ToolLandingPageProps {
  pageKey: ToolPageKey;
}

export default function ToolLandingPage({ pageKey }: ToolLandingPageProps) {
  const config = TOOL_PAGE_CONFIGS[pageKey];
  const controller = useQuickSetup(config);
  const replaceWorkspace = useAppStore((state) => state.replaceWorkspace);
  const navigate = useNavigate();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToResults, setHasScrolledToResults] = useState(false);

  useEffect(() => {
    trackLandingEvent('landing_route_viewed', {
      pageKey,
      canonicalPath: config.canonicalPath,
      preset: config.defaultPreset,
    });
  }, [config.canonicalPath, config.defaultPreset, pageKey]);

  // Scroll to results when they first appear
  useEffect(() => {
    if (controller.result && !hasScrolledToResults && resultsRef.current) {
      setHasScrolledToResults(true);
      resultsRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [controller.result, hasScrolledToResults]);

  const openAdvancedWorkspace = (target: 'results' | 'people') => {
    trackLandingEvent('landing_open_advanced_workspace', {
      hasResult: Boolean(controller.result),
      source: 'landing_page',
    });
    replaceWorkspace(controller.buildWorkspaceBridgePayload());
    navigate(target === 'results' ? '/app/results' : '/app/problem/people');
  };

  const workspacePayload = controller.buildWorkspaceBridgePayload();
  const solvedSolution = workspacePayload.solution ?? null;
  const sharedSessionData = solvedSolution
    ? buildResultsSessionData(workspacePayload.problem, solvedSolution)
    : [];

  const { draft, participantCount, estimatedGroupCount, estimatedGroupSize } = controller;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <Seo
        title={config.title}
        description={config.metaDescription}
        canonicalPath={config.canonicalPath}
        faqEntries={config.faqEntries}
      />

      {/* ─── Minimal header ─── */}
      <header
        className="border-b"
        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="GroupMixer logo" className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">GroupMixer</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/app"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:inline-flex"
              style={{ color: 'var(--text-secondary)' }}
            >
              Expert workspace
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <ThemeToggle size="md" />
          </div>
        </div>
      </header>

      <main>
        {/* ═══════════════════════════════════════════════════════
            HERO — Tool-first: headline left, form right
            ═══════════════════════════════════════════════════════ */}
        <section className="px-4 pb-10 pt-8 sm:px-6 lg:pb-16 lg:pt-12">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_minmax(340px,420px)] lg:items-start lg:gap-12">
            {/* ── Left: copy ── */}
            <div className="max-w-xl pt-2">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.15]">
                {config.h1}
              </h1>
              <p
                className="mt-4 text-base leading-7 sm:text-lg sm:leading-8"
                style={{ color: 'var(--text-secondary)' }}
              >
                {config.subhead}
              </p>

              {/* Quick trust signals */}
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
                  Free &amp; private
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
                  No sign-up
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
                  Results in seconds
                </span>
              </div>

              {/* Scroll-down nudge on desktop when no results yet */}
              {!controller.result && (
                <div className="mt-10 hidden text-sm lg:block" style={{ color: 'var(--text-secondary)' }}>
                  <span className="flex items-center gap-1">
                    <ChevronDown className="h-4 w-4" />
                    Scroll down for use cases &amp; FAQ
                  </span>
                </div>
              )}
            </div>

            {/* ── Right: the tool ── */}
            <div
              className="rounded-2xl border p-5 shadow-sm sm:p-6"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            >
              {/* Participants textarea */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="participantInput" className="text-sm font-medium">
                    Participants
                  </label>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {draft.inputMode === 'names' ? (
                      <button
                        type="button"
                        className="font-medium"
                        onClick={() =>
                          controller.updateDraft((c) => ({
                            ...c,
                            inputMode: 'csv',
                            balanceAttributeKey: null,
                          }))
                        }
                      >
                        Switch to CSV
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="font-medium"
                        onClick={() =>
                          controller.updateDraft((c) => ({
                            ...c,
                            inputMode: 'names',
                            balanceAttributeKey: null,
                          }))
                        }
                      >
                        Switch to names
                      </button>
                    )}
                    <span>·</span>
                    <button type="button" className="font-medium" onClick={controller.loadSampleData}>
                      Sample
                    </button>
                    <span>·</span>
                    <button type="button" className="font-medium" onClick={controller.resetDraft}>
                      Reset
                    </button>
                  </div>
                </div>
                <textarea
                  id="participantInput"
                  value={draft.participantInput}
                  onChange={(e) =>
                    controller.updateDraft((c) => ({ ...c, participantInput: e.target.value }))
                  }
                  placeholder={
                    draft.inputMode === 'csv'
                      ? 'name,team,role\nAlex,Blue,Engineer'
                      : 'One name per line'
                  }
                  className="min-h-[130px] w-full rounded-xl border px-3 py-2.5 text-sm leading-relaxed outline-none transition-shadow focus:ring-2"
                  style={{
                    borderColor: 'var(--border-primary)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Group sizing */}
              <div className="mt-4">
                <label htmlFor="groupingValue" className="mb-1.5 block text-sm font-medium">
                  {draft.groupingMode === 'groupCount' ? 'Number of groups' : 'People per group'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="groupingValue"
                    type="number"
                    min={1}
                    value={draft.groupingValue}
                    onChange={(e) =>
                      controller.updateDraft((c) => ({
                        ...c,
                        groupingValue: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="w-24 rounded-xl border px-3 py-2 text-sm outline-none transition-shadow focus:ring-2"
                    style={{
                      borderColor: 'var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-lg px-2.5 py-2 text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() =>
                      controller.updateDraft((c) => ({
                        ...c,
                        groupingMode: c.groupingMode === 'groupCount' ? 'groupSize' : 'groupCount',
                      }))
                    }
                  >
                    {draft.groupingMode === 'groupCount' ? '→ use people per group' : '→ use group count'}
                  </button>
                </div>
              </div>

              {/* Live summary */}
              <div
                className="mt-4 grid grid-cols-3 gap-2 rounded-xl px-3 py-2.5 text-center text-sm"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>People</div>
                  <div className="text-lg font-semibold">{participantCount}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Groups</div>
                  <div className="text-lg font-semibold">{estimatedGroupCount}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>~Size</div>
                  <div className="text-lg font-semibold">{estimatedGroupSize}</div>
                </div>
              </div>

              {/* Generate button */}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    trackLandingEvent('landing_generate_clicked', {
                      preset: draft.preset,
                      participantCount,
                      groupingMode: draft.groupingMode,
                    });
                    controller.generateGroups();
                  }}
                  disabled={!controller.canGenerate || controller.isSolving}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  <Sparkles className="h-4 w-4" />
                  {controller.isSolving ? 'Generating…' : 'Generate Groups'}
                </button>
                {controller.result && (
                  <button
                    type="button"
                    onClick={controller.reshuffle}
                    disabled={controller.isSolving}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ borderColor: 'var(--border-primary)' }}
                    title="Reshuffle"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Advanced options toggle — collapsed by default */}
              <div className="mt-4">
                <QuickSetupAdvancedOptions controller={controller} />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
            INLINE RESULTS — appears after Generate
            ═══════════════════════════════════════════════════════ */}
        {controller.result && (
          <section
            ref={resultsRef}
            className="border-t px-4 pb-12 pt-8 sm:px-6"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Your groups</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={controller.exportGroupsCsv}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
                    style={{ borderColor: 'var(--border-primary)' }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => openAdvancedWorkspace('results')}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  >
                    Open in expert workspace
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {controller.errorMessage && (
                <div
                  className="mb-5 rounded-xl px-4 py-3 text-sm"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                >
                  {controller.errorMessage}
                </div>
              )}

              {/* Solver-backed results with the shared grid */}
              {solvedSolution ? (
                <ResultsScheduleGrid sessionData={sharedSessionData} />
              ) : (
                // Fallback local results
                controller.result.sessions.map((session) => (
                  <div key={session.sessionNumber} className="mb-6">
                    <h3 className="mb-3 text-base font-semibold">
                      Session {session.sessionNumber}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {session.groups.map((group) => (
                        <div
                          key={`${session.sessionNumber}-${group.id}`}
                          className="rounded-xl border p-4"
                          style={{
                            borderColor: 'var(--border-primary)',
                            backgroundColor: 'var(--bg-primary)',
                          }}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-semibold">{group.id}</span>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {group.members.length} people
                            </span>
                          </div>
                          <ul className="space-y-1">
                            {group.members.map((member) => (
                              <li
                                key={member.id}
                                className="rounded-lg px-2.5 py-1.5 text-sm"
                                style={{ backgroundColor: 'var(--bg-secondary)' }}
                              >
                                {member.name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════
            USE CASES — below the fold
            ═══════════════════════════════════════════════════════ */}
        <section
          className="border-t px-4 pb-12 pt-10 sm:px-6"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              Works for classrooms, workshops, and events
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
              Start with a simple random split. When you need more control, GroupMixer grows with you.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: 'Classroom groups',
                  body: 'Teachers paste a student roster and create balanced groups in seconds. No learning curve.',
                },
                {
                  title: 'Workshop breakout rooms',
                  body: 'Split participants into breakout rooms for a single session or rotate across multiple rounds.',
                },
                {
                  title: 'Speed networking',
                  body: 'Generate multiple rounds where people meet new faces each time. Minimize repeat pairings automatically.',
                },
                {
                  title: 'Team projects',
                  body: 'Divide a class or team into project groups. Optionally balance by skill, role, or department.',
                },
                {
                  title: 'Conference sessions',
                  body: 'Assign attendees to parallel tracks or discussion tables while respecting constraints.',
                },
                {
                  title: 'Social mixers',
                  body: 'Plan icebreaker rounds where everyone meets someone new. Keep certain people together or apart.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border p-5"
                  style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
                >
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
            ADVANCED POWER — layered reveal
            ═══════════════════════════════════════════════════════ */}
        <section
          className="border-t px-4 pb-12 pt-10 sm:px-6"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
        >
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-tight">Need more control?</h2>
            <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
              GroupMixer is more than a random shuffler. When simple groups aren't enough, unlock advanced rules without switching tools.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: 'Keep certain people together',
                  body: 'Ensure friends, co-workers, or pre-assigned pairs always land in the same group.',
                },
                {
                  title: 'Keep certain people apart',
                  body: 'Prevent specific people from being grouped together — useful for conflict avoidance or diversity.',
                },
                {
                  title: 'Avoid repeat pairings',
                  body: 'Run multiple rounds where the same two people don\'t end up together again.',
                },
                {
                  title: 'Balance groups by attribute',
                  body: 'Use CSV input to balance groups by role, skill level, gender, department, or any custom column.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border p-5"
                  style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                <Users className="h-4 w-4" />
                Open expert workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                The expert workspace gives you full control over sessions, constraints, solver settings, and detailed result analysis.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
            FAQ — SEO + trust
            ═══════════════════════════════════════════════════════ */}
        <section
          className="border-t px-4 pb-14 pt-10 sm:px-6"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
            <QuickSetupFaq entries={config.faqEntries} />
          </div>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <LandingFooter />
    </div>
  );
}
