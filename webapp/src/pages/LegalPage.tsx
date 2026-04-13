import { useEffect } from 'react';
import { AppHeader } from '../components/AppHeader';
import { ObfuscatedEmailLink } from '../components/ObfuscatedEmailLink';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { Seo } from '../components/Seo';
import { SITE_LEGAL_CONFIG } from '../legal/legalConfig';
import { buildLegalPath, getLegalContent, getLegalHomePath } from '../legal/legalContent';
import type { SupportedLocale } from './toolPageConfigs';

interface LegalPageProps {
  locale: SupportedLocale;
}

function fill(template: string): string {
  return template
    .replace('{ownerName}', SITE_LEGAL_CONFIG.ownerName)
    .replace('{residence}', SITE_LEGAL_CONFIG.residence)
    .replace('{hostingProviderName}', SITE_LEGAL_CONFIG.hostingProviderName)
    .replace('{analyticsProviderName}', SITE_LEGAL_CONFIG.analyticsProviderName);
}

export default function LegalPage({ locale }: LegalPageProps) {
  const content = getLegalContent(locale);

  useEffect(() => {
    if (!window.location.hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    const id = window.location.hash.slice(1);
    const element = document.getElementById(id);
    if (!element) {
      return;
    }

    window.setTimeout(() => {
      element.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 0);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <Seo
        title={content.seoTitle}
        description={content.seoDescription}
        canonicalPath={buildLegalPath(locale)}
      />

      <AppHeader homeTo={getLegalHomePath(locale)} hideDesktopUtilityRail title="GroupMixer" />

      <main className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
              {content.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {content.pageTitle}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {content.intro}
            </p>
          </section>

          <section
            id="offenlegung"
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">{content.legalNoticeHeading}</h2>
            <p className="mt-3 text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {content.legalNoticeDescription}
            </p>

            <dl className="mt-6 grid gap-4 sm:grid-cols-[minmax(12rem,15rem)_1fr] sm:gap-x-6 sm:gap-y-5">
              <dt className="font-semibold">{content.ownerLabel}</dt>
              <dd>{SITE_LEGAL_CONFIG.ownerName}</dd>

              <dt className="font-semibold">{content.residenceLabel}</dt>
              <dd>{SITE_LEGAL_CONFIG.residence}</dd>

              <dt className="font-semibold">{content.purposeLabel}</dt>
              <dd>{content.purposeValue}</dd>

              <dt className="font-semibold">{content.directionLabel}</dt>
              <dd>{content.directionValue}</dd>

              <dt className="font-semibold">{content.contactLabel}</dt>
              <dd>
                <ObfuscatedEmailLink
                  localPart={SITE_LEGAL_CONFIG.contactEmailLocalPart}
                  domain={SITE_LEGAL_CONFIG.contactEmailDomain}
                />
              </dd>
            </dl>
          </section>

          <section
            id="privacy"
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">{content.privacyHeading}</h2>
            <div className="mt-6 space-y-7 text-sm leading-7 sm:text-base">
              <section>
                <h3 className="text-lg font-semibold">{content.controllerTitle}</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.controllerBody).split('{email}')[0]}
                  <ObfuscatedEmailLink
                    localPart={SITE_LEGAL_CONFIG.contactEmailLocalPart}
                    domain={SITE_LEGAL_CONFIG.contactEmailDomain}
                  />
                  {fill(content.controllerBody).split('{email}')[1]}
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">{content.hostingTitle}</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.hostingBody1)}
                </p>
                <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.hostingBody2)}
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">{content.scenarioDataTitle}</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.scenarioDataBody)}
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">{content.analyticsTitle}</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.analyticsBody1)}
                </p>
                <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.analyticsBody2)}
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">{content.localStorageTitle}</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.localStorageBody1)}
                </p>
                <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.localStorageBody2)}
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">{content.recipientsTitle}</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.recipientsBody)}
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">{content.rightsTitle}</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {fill(content.rightsBody)}
                </p>
              </section>
            </div>
          </section>

          <section
            className="rounded-2xl border p-6 sm:p-8 text-sm leading-7"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
          >
            <p>
              {content.externalReferencesLabel}: <a href={SITE_LEGAL_CONFIG.analyticsProviderUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{SITE_LEGAL_CONFIG.analyticsProviderName}</a>,{' '}
              <a href={SITE_LEGAL_CONFIG.hostingProviderUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{SITE_LEGAL_CONFIG.hostingProviderName}</a>,{' '}
              <a href={SITE_LEGAL_CONFIG.issueTrackerUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">GitHub Issues</a>
            </p>
            <p className="mt-3">{content.updatedLabel}: {SITE_LEGAL_CONFIG.lastUpdated}</p>
          </section>
        </div>
      </main>

      <LandingFooter
        expertWorkspaceTo="/app"
        expertWorkspaceLabel={content.advancedEditorLabel}
        privacyNote={content.footerPrivacyNote}
      />
    </div>
  );
}
