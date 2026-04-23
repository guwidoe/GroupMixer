import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { Seo } from '../components/Seo';
import type { GuidePageKey } from './guidePageConfigs';
import { getGuidePageConfig } from './guidePageConfigs';

interface GuidePageProps {
  pageKey: GuidePageKey;
}

export default function GuidePage({ pageKey }: GuidePageProps) {
  const config = getGuidePageConfig(pageKey);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <Seo
        title={config.seo.title}
        description={config.seo.description}
        canonicalPath={config.canonicalPath}
        includeStructuredData={false}
      />

      <AppHeader homeTo="/" titleAs="div" hideDesktopUtilityRail title="GroupMixer" />

      <main className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
              {config.hero.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{config.hero.title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {config.hero.intro}
            </p>
          </section>

          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">{config.problem.title}</h2>
            <p className="mt-3 text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {config.problem.body}
            </p>
            <ul className="mt-5 space-y-3 text-sm leading-6 sm:text-base">
              {config.problem.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--color-accent)' }} />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">{config.failureModes.title}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {config.failureModes.cards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border p-5"
                  style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  <h3 className="text-base font-semibold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">{config.example.title}</h2>
            <p className="mt-3 text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {config.example.summary}
            </p>
            <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
              <p className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
                Example workflow
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {config.example.details.map((detail) => (
                  <li key={detail} className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--border-primary)' }}>
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">{config.setup.title}</h2>
            <p className="mt-3 text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {config.setup.intro}
            </p>
            <ol className="mt-6 space-y-4">
              {config.setup.steps.map((step, index) => (
                <li key={step} className="flex gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 sm:text-base">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">{config.advanced.title}</h2>
            <p className="mt-3 text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {config.advanced.body}
            </p>
          </section>

          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">{config.cta.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {config.cta.body}
            </p>
            <Link
              to={config.cta.href}
              className="btn-primary mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
            >
              {config.cta.buttonLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>

          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">{config.relatedTools.title}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {config.relatedTools.links.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="rounded-xl border p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  <h3 className="text-base font-semibold">{link.label}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {link.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          {config.relatedGuides && config.relatedGuides.links.length > 0 ? (
            <section
              className="rounded-2xl border p-6 sm:p-8"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            >
              <h2 className="text-2xl font-semibold tracking-tight">{config.relatedGuides.title}</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {config.relatedGuides.links.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className="rounded-xl border p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <h3 className="text-base font-semibold">{link.label}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {link.description}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <LandingFooter expertWorkspaceTo={config.cta.href} expertWorkspaceLabel={config.cta.buttonLabel} />
    </div>
  );
}
