import { ArrowRight, ChevronDown, Copy, Download, RotateCcw, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QuickSetupAdvancedOptions } from '../components/LandingTool/QuickSetupAdvancedOptions';
import { QuickSetupFaq } from '../components/LandingTool/QuickSetupFaq';
import { useQuickSetup } from '../components/LandingTool/useQuickSetup';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { ResultsScheduleGrid } from '../components/ResultsView/ResultsScheduleGrid';
import { buildResultsSessionData } from '../components/results/buildResultsViewModel';
import { ThemeToggle } from '../components/ThemeToggle';
import { Seo } from '../components/Seo';
import { trackLandingEvent } from '../services/landingInstrumentation';
import { useAppStore } from '../store';
import { TOOL_PAGE_CONFIGS, type ToolPageKey } from './toolPageConfigs';

interface ToolLandingPageProps {
  pageKey: ToolPageKey;
}

type ResultFormat = 'cards' | 'list' | 'text' | 'csv';

interface DisplaySession {
  sessionNumber: number;
  groups: Array<{
    id: string;
    members: string[];
  }>;
}

function buildDisplaySessions(
  sharedSessionData: Array<{ sessionIndex: number; groups: Array<{ id: string; people: Array<{ id: string }> }> }>,
  fallbackSessions: Array<{ sessionNumber: number; groups: Array<{ id: string; members: Array<{ name: string }> }> }>,
): DisplaySession[] {
  if (sharedSessionData.length > 0) {
    return sharedSessionData.map((session) => ({
      sessionNumber: session.sessionIndex + 1,
      groups: session.groups.map((group) => ({
        id: group.id,
        members: group.people.map((person) => person.id),
      })),
    }));
  }

  return fallbackSessions.map((session) => ({
    sessionNumber: session.sessionNumber,
    groups: session.groups.map((group) => ({
      id: group.id,
      members: group.members.map((member) => member.name),
    })),
  }));
}

function buildResultText(sessions: DisplaySession[]) {
  return sessions
    .map((session) =>
      [
        `Session ${session.sessionNumber}`,
        ...session.groups.map((group) => `${group.id}: ${group.members.join(', ') || 'No assignments'}`),
      ].join('\n'),
    )
    .join('\n\n');
}

function buildResultCsv(sessions: DisplaySession[]) {
  const lines = ['session,group,members'];
  for (const session of sessions) {
    for (const group of session.groups) {
      lines.push(`${session.sessionNumber},${group.id},"${group.members.join(', ')}"`);
    }
  }
  return lines.join('\n');
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Ignore clipboard failures in unsupported environments.
  }
}

export default function ToolLandingPage({ pageKey }: ToolLandingPageProps) {
  const config = TOOL_PAGE_CONFIGS[pageKey];
  const controller = useQuickSetup(config);
  const syncWorkspaceDraft = useAppStore((state) => state.syncWorkspaceDraft);
  const navigate = useNavigate();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToResults, setHasScrolledToResults] = useState(false);
  const [resultFormat, setResultFormat] = useState<ResultFormat>('cards');
  const [copiedFormat, setCopiedFormat] = useState<ResultFormat | null>(null);

  useEffect(() => {
    trackLandingEvent('landing_route_viewed', {
      pageKey,
      canonicalPath: config.canonicalPath,
      preset: config.defaultPreset,
    });
  }, [config.canonicalPath, config.defaultPreset, pageKey]);

  const workspacePayload = controller.workspacePayload;
  const solvedSolution = workspacePayload.solution ?? null;
  const sharedSessionData = solvedSolution ? buildResultsSessionData(workspacePayload.problem, solvedSolution) : [];
  const displaySessions = useMemo(
    () => buildDisplaySessions(sharedSessionData, controller.result?.sessions ?? []),
    [controller.result?.sessions, sharedSessionData],
  );
  const resultText = useMemo(() => buildResultText(displaySessions), [displaySessions]);
  const resultCsv = useMemo(() => buildResultCsv(displaySessions), [displaySessions]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const syncedProblemId = syncWorkspaceDraft({
        ...workspacePayload,
        currentProblemId: controller.draft.workspaceProblemId,
        problemName: `${config.h1} draft`,
      });

      if (syncedProblemId !== controller.draft.workspaceProblemId) {
        controller.updateDraft((current) => ({
          ...current,
          workspaceProblemId: syncedProblemId,
        }));
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    config.h1,
    controller,
    controller.draft.workspaceProblemId,
    syncWorkspaceDraft,
    workspacePayload,
  ]);

  useEffect(() => {
    if (controller.result && !hasScrolledToResults && resultsRef.current) {
      setHasScrolledToResults(true);
      resultsRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [controller.result, hasScrolledToResults]);

  useEffect(() => {
    if (!controller.result) {
      setResultFormat('cards');
      setCopiedFormat(null);
    }
  }, [controller.result]);

  const openAdvancedWorkspace = (target: 'results' | 'people') => {
    trackLandingEvent('landing_open_advanced_workspace', {
      hasResult: Boolean(controller.result),
      source: 'landing_page',
    });

    const syncedProblemId = syncWorkspaceDraft({
      ...workspacePayload,
      currentProblemId: controller.draft.workspaceProblemId,
      problemName: `${config.h1} draft`,
    });

    if (syncedProblemId !== controller.draft.workspaceProblemId) {
      controller.updateDraft((current) => ({
        ...current,
        workspaceProblemId: syncedProblemId,
      }));
    }

    navigate(target === 'results' ? '/app/results' : '/app/problem/people');
  };

  const { draft, participantCount, estimatedGroupCount, estimatedGroupSize } = controller;
  const heroOrderClass = controller.result ? 'order-3 lg:order-1' : 'order-2 lg:order-1';
  const resultsSection = controller.result ? (
    <div
      ref={resultsRef}
      data-testid="landing-results-panel"
      className="order-2 border-t pt-8 lg:order-3 lg:col-span-2"
      style={{ borderColor: 'var(--border-primary)' }}
    >
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
            className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold"
          >
            Open in expert workspace
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {controller.errorMessage && (
        <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
          {controller.errorMessage}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Result formats">
          {(['cards', 'list', 'text', 'csv'] as ResultFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              role="tab"
              aria-selected={resultFormat === format}
              onClick={() => setResultFormat(format)}
              className="rounded-full border px-3 py-1.5 text-sm font-medium capitalize"
              style={{
                borderColor: resultFormat === format ? 'var(--color-accent)' : 'var(--border-primary)',
                backgroundColor: resultFormat === format ? 'var(--bg-secondary)' : 'transparent',
              }}
            >
              {format}
            </button>
          ))}
        </div>

        {(resultFormat === 'text' || resultFormat === 'csv') && (
          <button
            type="button"
            onClick={async () => {
              const formatToCopy = resultFormat;
              await copyText(formatToCopy === 'csv' ? resultCsv : resultText);
              setCopiedFormat(formatToCopy);
              window.setTimeout(() => setCopiedFormat((current) => (current === formatToCopy ? null : current)), 1200);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <Copy className="h-3.5 w-3.5" />
            {copiedFormat === resultFormat ? 'Copied' : `Copy ${resultFormat.toUpperCase()}`}
          </button>
        )}
      </div>

      {resultFormat === 'cards' && (
        solvedSolution ? (
          <ResultsScheduleGrid sessionData={sharedSessionData} />
        ) : (
          controller.result.sessions.map((session) => (
            <div key={session.sessionNumber} className="mb-6">
              <h3 className="mb-3 text-base font-semibold">Session {session.sessionNumber}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {session.groups.map((group) => (
                  <div
                    key={`${session.sessionNumber}-${group.id}`}
                    className="rounded-xl border p-4"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
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
        )
      )}

      {resultFormat === 'list' && (
        <div className="space-y-5">
          {displaySessions.map((session) => (
            <div key={session.sessionNumber} className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
              <h3 className="text-base font-semibold">Session {session.sessionNumber}</h3>
              <div className="mt-3 space-y-3">
                {session.groups.map((group) => (
                  <div key={`${session.sessionNumber}-${group.id}`}>
                    <div className="text-sm font-semibold">{group.id}</div>
                    <div className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {group.members.join(', ') || 'No assignments'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {resultFormat === 'text' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Plain text format for easy copy/paste into chat, docs, or email.
          </p>
          <textarea
            aria-label="Text results"
            readOnly
            value={resultText}
            className="min-h-[260px] w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
        </div>
      )}

      {resultFormat === 'csv' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            CSV format for spreadsheets, docs, and quick manual editing.
          </p>
          <textarea
            aria-label="CSV results"
            readOnly
            value={resultCsv}
            className="min-h-[260px] w-full rounded-xl border px-4 py-3 font-mono text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <Seo
        title={config.title}
        description={config.metaDescription}
        canonicalPath={config.canonicalPath}
        faqEntries={config.faqEntries}
      />

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
            <button
              type="button"
              onClick={() => openAdvancedWorkspace(controller.result ? 'results' : 'people')}
              className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:inline-flex"
              style={{ color: 'var(--text-secondary)' }}
            >
              Expert workspace
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <ThemeToggle size="md" />
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 pb-10 pt-8 sm:px-6 lg:pb-16 lg:pt-12">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_minmax(340px,420px)] lg:items-start lg:gap-12">
            <div data-testid="landing-hero" className={`${heroOrderClass} max-w-xl pt-2`}>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.15]">
                {config.h1}
              </h1>
              <p className="mt-4 text-base leading-7 sm:text-lg sm:leading-8" style={{ color: 'var(--text-secondary)' }}>
                {config.subhead}
              </p>

              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
                  Private (processed in your browser)
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

              <div
                className="mt-8 rounded-2xl border p-5 sm:p-6"
                style={{
                  borderColor: 'var(--border-primary)',
                  backgroundColor: 'var(--bg-primary)',
                }}
              >
                <div className="max-w-lg">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
                    Want to do better than random?
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                    Try the full group optimizer.
                  </h2>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>Keep together</span>
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>Avoid pairings</span>
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>Multiple rounds</span>
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>Maximize mixing</span>
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>Balance genders</span>
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>Tweak results</span>
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>Balance any attribute</span>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openAdvancedWorkspace(controller.result ? 'results' : 'people')}
                      className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
                    >
                      <Users className="h-4 w-4" />
                      Open expert workspace
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Your landing-page draft comes with you.
                    </span>
                  </div>
                </div>
              </div>

              {!controller.result && (
                <div className="mt-10 hidden text-sm lg:block" style={{ color: 'var(--text-secondary)' }}>
                  <span className="flex items-center gap-1">
                    <ChevronDown className="h-4 w-4" />
                    Scroll down for use cases &amp; FAQ
                  </span>
                </div>
              )}
            </div>

            <div
              data-testid="landing-tool-panel"
              className="order-1 rounded-2xl border p-5 shadow-sm sm:p-6 lg:order-2"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            >
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
                          controller.updateDraft((current) => ({
                            ...current,
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
                          controller.updateDraft((current) => ({
                            ...current,
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
                  onChange={(event) =>
                    controller.updateDraft((current) => ({ ...current, participantInput: event.target.value }))
                  }
                  placeholder={draft.inputMode === 'csv' ? 'name,team,role\nAlex,Blue,Engineer' : 'One name per line'}
                  className="min-h-[130px] w-full rounded-xl border px-3 py-2.5 text-sm leading-relaxed outline-none transition-shadow focus:ring-2"
                  style={{
                    borderColor: 'var(--border-primary)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

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
                    onChange={(event) =>
                      controller.updateDraft((current) => ({
                        ...current,
                        groupingValue: Math.max(1, Number(event.target.value) || 1),
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
                      controller.updateDraft((current) => ({
                        ...current,
                        groupingMode: current.groupingMode === 'groupCount' ? 'groupSize' : 'groupCount',
                      }))
                    }
                  >
                    {draft.groupingMode === 'groupCount' ? '→ use people per group' : '→ use group count'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl px-3 py-2.5 text-center text-sm" style={{ backgroundColor: 'var(--bg-secondary)' }}>
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
                  className="btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
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

              <div className="mt-4">
                <QuickSetupAdvancedOptions controller={controller} />
              </div>
            </div>

            {resultsSection}
          </div>
        </section>

        <section className="border-t px-4 pb-12 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-tight">Works for classrooms, workshops, and events</h2>
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
                <div key={item.title} className="rounded-xl border p-5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t px-4 pb-12 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
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
                <div key={item.title} className="rounded-xl border p-5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => openAdvancedWorkspace(controller.result ? 'results' : 'people')}
                className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
              >
                <Users className="h-4 w-4" />
                Open expert workspace
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                The expert workspace gives you full control over sessions, constraints, solver settings, and detailed result analysis.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t px-4 pb-14 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
            <QuickSetupFaq entries={config.faqEntries} />
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
