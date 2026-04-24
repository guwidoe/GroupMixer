import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Sparkles,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { EmbeddableTool } from '../components/EmbeddableTool/Tool';
import {
  HEADER_ACTION_BUTTON_CLASS,
  HEADER_ACTION_DIVIDER_CLASS,
} from '../components/headerActionStyles';
import { GuideRelatedLinkGrid } from '../components/GuidePage/GuideRelatedLinkGrid';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { Seo } from '../components/Seo';
import type { GuidePageKey } from './guidePageConfigs';
import { getGuidePageConfig } from './guidePageConfigs';

interface GuidePageProps {
  pageKey: GuidePageKey;
}

function GuideHeroVisual({ details }: { details: string[] }) {
  const visibleDetails = details.slice(0, 5);

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 5%, var(--bg-primary) 95%)',
        boxShadow: 'var(--shadow-lg)',
      }}
      aria-label="Example GroupMixer schedule preview"
    >
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#2563eb' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#14b8a6' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
            GroupMixer setup
          </span>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(0,0.82fr)_minmax(15rem,0.68fr)]">
        <div className="border-b p-5 md:border-b-0 md:border-r sm:p-6" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="grid gap-3 sm:grid-cols-2">
            {['Group 1', 'Group 2', 'Group 3', 'Group 4'].map((group, groupIndex) => (
              <div
                key={group}
                className={['rounded-lg border p-3', groupIndex > 1 ? 'hidden sm:block' : ''].filter(Boolean).join(' ')}
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
              >
                <div className="flex items-center justify-between gap-3 border-b pb-2" style={{ borderColor: 'var(--border-primary)' }}>
                  <p className="text-sm font-semibold">{group}</p>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Round {groupIndex + 1}</p>
                </div>
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((itemIndex) => (
                    <div key={itemIndex} className="flex items-center gap-2">
                      <span
                        className="h-6 w-6 rounded-full"
                        style={{
                          backgroundColor: [
                            'color-mix(in srgb, #2563eb 18%, var(--bg-primary) 82%)',
                            'color-mix(in srgb, #14b8a6 18%, var(--bg-primary) 82%)',
                            'color-mix(in srgb, #f59e0b 20%, var(--bg-primary) 80%)',
                          ][(groupIndex + itemIndex) % 3],
                        }}
                      />
                      <span
                        className="h-2.5 flex-1 rounded-full"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--text-tertiary) 16%, transparent)' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-sm font-semibold">Guide setup</p>
          <ul className="mt-4 space-y-3">
            {visibleDetails.map((detail) => (
              <li key={detail} className="flex items-start gap-3 text-sm leading-6">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
                <span style={{ color: 'var(--text-secondary)' }}>{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function GuidePage({ pageKey }: GuidePageProps) {
  const config = getGuidePageConfig(pageKey);
  const relatedGuideLinks = config.relatedGuides?.links ?? [];
  const relatedToolLinks = config.relatedTools?.links ?? [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <Seo
        title={config.seo.title}
        description={config.seo.description}
        canonicalPath={config.canonicalPath}
        includeStructuredData={false}
      />

      <AppHeader
        homeTo="/"
        logoAlt="GroupMixer logo"
        titleAs="div"
        desktopBreakpoint="landing"
        utilityRailFramed={false}
        title="GroupMixer"
        renderDesktopActions={() => (
          <>
            <Link
              to="/app"
              className={[HEADER_ACTION_BUTTON_CLASS, 'hidden min-[700px]:inline-flex items-center gap-1.5 whitespace-nowrap'].join(' ')}
            >
              Scenario editor
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <div
              className={HEADER_ACTION_DIVIDER_CLASS}
              style={{ backgroundColor: 'var(--border-primary)' }}
              aria-hidden="true"
            />
          </>
        )}
        renderMobileActions={() => (
          <Link
            to="/app"
            className="btn-secondary flex w-full items-center justify-center gap-1.5"
          >
            Scenario editor
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      />

      <main className="border-t" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
        <div className="border-b px-4 py-3 sm:px-6 lg:px-8" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
          <nav className="mx-auto flex max-w-6xl items-center gap-2 text-sm" aria-label="Breadcrumb">
            <Link to="/" className="transition hover:text-[var(--color-accent)]" style={{ color: 'var(--text-secondary)' }}>
              Home
            </Link>
            <span aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>/</span>
            <Link to="/#guides" className="transition hover:text-[var(--color-accent)]" style={{ color: 'var(--text-secondary)' }}>
              Guides
            </Link>
            <span aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>/</span>
            <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{config.hero.title}</span>
          </nav>
        </div>

        <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <header>
            <Link
              to="/#guides"
              className="inline-flex items-center gap-2 text-sm font-medium transition hover:text-[var(--color-accent)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to guides
            </Link>

            <div className="mt-9 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, var(--bg-primary) 90%)',
                  color: 'var(--color-accent)',
                }}
              >
                {config.hero.eyebrow}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Updated guide
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                {Math.max(4, config.example.details.length + config.failureModes.cards.length)} min read
              </span>
            </div>

            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-normal sm:text-5xl">
              {config.hero.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 sm:text-xl" style={{ color: 'var(--text-secondary)' }}>
              {config.hero.intro}
            </p>

            <div className="mt-9">
              <GuideHeroVisual details={config.example.details} />
            </div>
          </header>

          <div className="mt-12 space-y-12">
            <section id="problem" className="scroll-mt-24">
              <p className="text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                {config.problem.body}
              </p>
              <h2 className="mt-8 text-2xl font-semibold leading-tight tracking-normal sm:text-3xl">{config.problem.title}</h2>
              <ul className="mt-5 space-y-2 text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                {config.problem.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section id="pitfalls" className="scroll-mt-24">
              <h2 className="text-2xl font-semibold leading-tight tracking-normal sm:text-3xl">{config.failureModes.title}</h2>
              <div className="mt-6 space-y-6">
                {config.failureModes.cards.map((card) => (
                  <div key={card.title}>
                    <h3 className="text-lg font-semibold">{card.title}</h3>
                    <p className="mt-2 text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section
              id="example"
              className="scroll-mt-24 rounded-lg border p-6 sm:p-8"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-accent) 18%, var(--border-primary) 82%)',
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 5%, var(--bg-primary) 95%)',
              }}
            >
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
                <h2 className="text-2xl font-semibold leading-tight tracking-normal">{config.example.title}</h2>
              </div>
              <p className="mt-4 text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                {config.example.summary}
              </p>
              <ul className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {config.example.details.map((detail) => (
                  <li key={detail} className="flex gap-3 text-sm leading-7">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section id="try-groupmixer" className="scroll-mt-24 border-t pt-10" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
                <h2 className="text-2xl font-semibold leading-tight tracking-normal sm:text-3xl">Try this setup in GroupMixer</h2>
              </div>
              <p className="mt-4 text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                This tool is preloaded with the example from this guide. You can edit the participants, constraints, sessions, and balance settings before generating groups.
              </p>
              <div className="relative left-1/2 mt-8 w-screen max-w-6xl -translate-x-1/2 px-4 sm:px-6 lg:px-8">
                <EmbeddableTool
                  key={`guide-tool:${config.key}`}
                  pageKey="home"
                  locale="en"
                  initialGuideExampleKey={config.key}
                  storageScope={`guide.${config.key}`}
                />
              </div>
            </section>

            {relatedToolLinks.length > 0 ? (
              <section id="tools" className="scroll-mt-24">
                <h2 className="text-2xl font-semibold tracking-normal">{config.relatedTools?.title}</h2>
                <GuideRelatedLinkGrid links={relatedToolLinks} columns="three" />
              </section>
            ) : null}

            {relatedGuideLinks.length > 0 ? (
              <section id="guides" className="scroll-mt-24 border-t pt-10" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center gap-3">
                  <BookOpenText className="h-6 w-6 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
                  <h2 className="text-2xl font-semibold tracking-normal">{config.relatedGuides?.title}</h2>
                </div>
                <GuideRelatedLinkGrid links={relatedGuideLinks} columns="two" />
              </section>
            ) : null}
          </div>
        </article>
      </main>

      <LandingFooter />
    </div>
  );
}
