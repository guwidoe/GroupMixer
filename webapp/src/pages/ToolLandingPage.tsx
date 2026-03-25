import { ArrowRight, Compass, Layers3 } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { trackLandingEvent } from '../services/landingInstrumentation';
import { QuickSetupFaq } from '../components/LandingTool/QuickSetupFaq';
import { QuickSetupPanel } from '../components/LandingTool/QuickSetupPanel';
import { Seo } from '../components/Seo';
import { TOOL_PAGE_CONFIGS, type ToolPageKey } from './toolPageConfigs';

interface ToolLandingPageProps {
  pageKey: ToolPageKey;
}

export default function ToolLandingPage({ pageKey }: ToolLandingPageProps) {
  const config = TOOL_PAGE_CONFIGS[pageKey];

  useEffect(() => {
    trackLandingEvent('landing_route_viewed', {
      pageKey,
      canonicalPath: config.canonicalPath,
      preset: config.defaultPreset,
    });
  }, [config.canonicalPath, config.defaultPreset, pageKey]);

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
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,500px)] lg:items-start">
            <div className="max-w-2xl">
              <div
                className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.22em]"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
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

              <div className="mt-8 flex flex-wrap gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>Paste names</span>
                <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>Choose groups or size</span>
                <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>Add rules only if needed</span>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    icon: Compass,
                    title: 'Start simple',
                    body: 'Use the landing tool like a fast random group generator instead of learning the whole workspace first.',
                  },
                  {
                    icon: Layers3,
                    title: 'Reveal more only when needed',
                    body: 'Keep together, avoid pairing, balancing, and repeat-round controls stay available without dominating the first screen.',
                  },
                  {
                    icon: ArrowRight,
                    title: 'Still grows into the expert app',
                    body: 'If the setup becomes serious, move the same draft into /app for deeper editing, solver tuning, and results inspection.',
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

            <QuickSetupPanel pageConfig={config} />
          </div>
        </section>

        <section className="px-4 pb-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold tracking-tight">What people usually need first</h2>
              <p className="mt-4 text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                Most visitors are not looking for a lecture on optimization. They want a fast way to split names into random groups, balanced teams, or repeat rounds — and only then decide whether stronger rules matter.
              </p>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {[
                {
                  title: 'Random groups in seconds',
                  body: 'Paste a list of names, choose the number of groups or people per group, and generate a clean first pass immediately.',
                },
                {
                  title: 'Balanced teams when needed',
                  body: 'Switch on CSV mode and use balancing or keep-together rules when the groups need more structure than a simple randomizer can provide.',
                },
                {
                  title: 'Multiple rounds without repetition',
                  body: 'Use the networking preset to plan repeated rounds and reduce repeat pairings for workshops, mixers, and breakout sessions.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-3xl border p-6"
                  style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
                >
                  <h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,360px)]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Technical credibility, lower in the page where it belongs</h2>
              <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                GroupMixer still keeps the strengths that matter for serious planning: local-first processing, multi-session support, no-repeat pairings, keep-together and avoid-pairing rules, and a deeper expert workspace. Those details now support the first interaction instead of replacing it.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  'Privacy-first browser workflow',
                  'Multi-session group planning',
                  'Keep-together and avoid-pairing rules',
                  'Advanced Rust + WebAssembly engine under the hood',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
                    {item}
                  </div>
                ))}
              </div>
              <p className="mt-6 max-w-3xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                If you only need a fast random group generator, stay on the landing tool. If you need deeper control, the same product continues inside <code>/app</code> without flattening the advanced workflow into a toy interface.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
              <div className="mt-4">
                <QuickSetupFaq entries={config.faqEntries} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
