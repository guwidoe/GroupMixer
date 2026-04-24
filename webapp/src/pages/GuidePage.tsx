import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  ClipboardList,
  Compass,
  Layers3,
  Link2,
  Sparkles,
  Target,
  Wrench,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import {
  HEADER_ACTION_BUTTON_CLASS,
  HEADER_ACTION_DIVIDER_CLASS,
} from '../components/headerActionStyles';
import { GuideRelatedLinkGrid } from '../components/GuidePage/GuideRelatedLinkGrid';
import { GuideSectionIcon } from '../components/GuidePage/GuideSectionIcon';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { Seo } from '../components/Seo';
import type { GuidePageKey } from './guidePageConfigs';
import { getGuidePageConfig } from './guidePageConfigs';

interface GuidePageProps {
  pageKey: GuidePageKey;
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

      <main>
        <section className="border-b px-4 py-10 sm:px-6 lg:px-8 lg:py-14" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                <BookOpenText className="h-4 w-4" aria-hidden="true" />
                {config.hero.eyebrow}
              </p>
              <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-normal sm:text-5xl">
                {config.hero.title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 sm:text-lg" style={{ color: 'var(--text-secondary)' }}>
                {config.hero.intro}
              </p>
            </div>
            <aside
              className="rounded-lg border p-5"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
              aria-label="Guide summary"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--color-accent) 32%, var(--border-primary) 68%)',
                    backgroundColor: 'color-mix(in srgb, var(--color-accent) 9%, var(--bg-primary) 91%)',
                    color: 'var(--color-accent)',
                  }}
                  aria-hidden="true"
                >
                  <Compass className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Guide format</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Problem, setup, and next steps</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 divide-x divide-[var(--border-primary)] rounded-lg border text-center" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="px-2 py-3">
                  <div className="text-base font-semibold">{config.failureModes.cards.length}</div>
                  <div className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>risks</div>
                </div>
                <div className="px-2 py-3">
                  <div className="text-base font-semibold">{config.setup.steps.length}</div>
                  <div className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>steps</div>
                </div>
                <div className="px-2 py-3">
                  <div className="text-base font-semibold">{config.example.details.length}</div>
                  <div className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>inputs</div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:px-8 lg:py-14">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-2 text-sm" aria-label="Guide sections">
              {[
                ['Problem', '#problem'],
                ['Pitfalls', '#pitfalls'],
                ['Example', '#example'],
                ['Setup', '#setup'],
                ['Advanced', '#advanced'],
                ...(config.cta ? [['Next', '#next']] : []),
                ...(relatedToolLinks.length > 0 ? [['Tools', '#tools']] : []),
                ...(relatedGuideLinks.length > 0 ? [['Guides', '#guides']] : []),
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className="block rounded-md px-3 py-2 transition hover:bg-[var(--bg-primary)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 space-y-12">
            <section id="problem" className="grid scroll-mt-24 gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(17rem,0.72fr)]">
              <div>
                <div className="flex items-center gap-3">
                  <GuideSectionIcon icon={<Target className="h-5 w-5" />} />
                  <p className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>Core problem</p>
                </div>
                <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-normal sm:text-3xl">{config.problem.title}</h2>
                <p className="mt-4 text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                  {config.problem.body}
                </p>
              </div>
              <ul className="space-y-3">
                {config.problem.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex gap-3 rounded-lg border p-4 text-sm leading-6"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section id="pitfalls" className="scroll-mt-24 border-t pt-10" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center gap-3">
                <GuideSectionIcon icon={<AlertTriangle className="h-5 w-5" />} />
                <h2 className="text-2xl font-semibold tracking-normal">{config.failureModes.title}</h2>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {config.failureModes.cards.map((card) => (
                  <div
                    key={card.title}
                    className="rounded-lg border p-5"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--shadow)' }}
                  >
                    <h3 className="text-base font-semibold">{card.title}</h3>
                    <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section id="example" className="scroll-mt-24 border-t pt-10" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(18rem,1fr)] lg:items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <GuideSectionIcon icon={<ClipboardList className="h-5 w-5" />} />
                    <h2 className="text-2xl font-semibold tracking-normal">{config.example.title}</h2>
                  </div>
                  <p className="mt-4 text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                    {config.example.summary}
                  </p>
                </div>
                <div className="rounded-lg border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
                  <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border-primary)' }}>
                    <p className="text-sm font-semibold">Example workflow</p>
                  </div>
                  <ul className="divide-y divide-[var(--border-primary)]">
                    {config.example.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-3 px-5 py-3 text-sm leading-6">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section id="setup" className="scroll-mt-24 border-t pt-10" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="max-w-3xl">
                <div className="flex items-center gap-3">
                  <GuideSectionIcon icon={<Layers3 className="h-5 w-5" />} />
                  <h2 className="text-2xl font-semibold tracking-normal">{config.setup.title}</h2>
                </div>
                <p className="mt-4 text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                  {config.setup.intro}
                </p>
              </div>
              <ol className="mt-7 space-y-4">
                {config.setup.steps.map((step, index) => (
                  <li key={step} className="grid gap-4 sm:grid-cols-[3rem_minmax(0,1fr)]">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-semibold"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--color-accent) 35%, var(--border-primary) 65%)',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--color-accent)',
                      }}
                    >
                      {index + 1}
                    </div>
                    <p
                      className="rounded-lg border p-4 text-sm leading-6 sm:text-base"
                      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
                    >
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section id="advanced" className="scroll-mt-24 border-t pt-10" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="rounded-lg border p-6 sm:p-7" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
                <div className="flex items-center gap-3">
                  <GuideSectionIcon icon={<Wrench className="h-5 w-5" />} />
                  <h2 className="text-2xl font-semibold tracking-normal">{config.advanced.title}</h2>
                </div>
                <p className="mt-4 max-w-4xl text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                  {config.advanced.body}
                </p>
              </div>
            </section>

            {config.cta ? (
              <section id="next" className="scroll-mt-24 border-t pt-10" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="rounded-lg border p-6 sm:p-8" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
                  <h2 className="text-2xl font-semibold tracking-normal">{config.cta.title}</h2>
                  <p className="mt-4 max-w-3xl text-base leading-8" style={{ color: 'var(--text-secondary)' }}>
                    {config.cta.body}
                  </p>
                  <Link
                    to={config.cta.href}
                    className="btn-primary mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold"
                  >
                    {config.cta.buttonLabel}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </section>
            ) : null}

            {relatedToolLinks.length > 0 ? (
              <section id="tools" className="scroll-mt-24 border-t pt-10" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center gap-3">
                  <GuideSectionIcon icon={<Link2 className="h-5 w-5" />} />
                  <h2 className="text-2xl font-semibold tracking-normal">{config.relatedTools?.title}</h2>
                </div>
                <GuideRelatedLinkGrid links={relatedToolLinks} columns="three" />
              </section>
            ) : null}

            {relatedGuideLinks.length > 0 ? (
              <section id="guides" className="scroll-mt-24 border-t pt-10" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center gap-3">
                  <GuideSectionIcon icon={<BookOpenText className="h-5 w-5" />} />
                  <h2 className="text-2xl font-semibold tracking-normal">{config.relatedGuides?.title}</h2>
                </div>
                <GuideRelatedLinkGrid links={relatedGuideLinks} columns="two" />
              </section>
            ) : null}
          </article>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
