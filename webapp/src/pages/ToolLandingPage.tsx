import { ArrowRight, Compass, Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { QuickSetupFaq } from '../components/LandingTool/QuickSetupFaq';
import { QuickSetupPanel } from '../components/LandingTool/QuickSetupPanel';
import { Seo } from '../components/Seo';
import { TOOL_PAGE_CONFIGS, type ToolPageKey } from './toolPageConfigs';

interface ToolLandingPageProps {
  pageKey: ToolPageKey;
}

export default function ToolLandingPage({ pageKey }: ToolLandingPageProps) {
  const config = TOOL_PAGE_CONFIGS[pageKey];

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

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    icon: Compass,
                    title: 'Fast first success',
                    body: 'Paste names, choose sizing, and generate a workable first pass without opening the expert app.',
                  },
                  {
                    icon: Layers3,
                    title: 'Layered complexity',
                    body: 'Reveal sessions, keep-together rules, avoid-pairing, and balancing only when you actually need them.',
                  },
                  {
                    icon: ArrowRight,
                    title: 'Advanced path preserved',
                    body: 'The full /app workspace remains the expert cockpit for deeper editing, solver control, and detailed inspection.',
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

        <section className="px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,360px)]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Why this route exists</h2>
              <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                Search visitors should land on a page that behaves like a real grouping tool immediately. The landing route now works as a safe scratchpad while the advanced application remains available under <code>/app</code>.
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
