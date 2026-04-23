import { ArrowRight, Users } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { EmbeddableTool, type EmbeddableToolHandle } from '../components/LandingTool/EmbeddableTool';
import { QuickSetupFaq } from '../components/LandingTool/QuickSetupFaq';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { HomeAnimatedHeroTitle } from '../components/LandingPage/HomeAnimatedHeroTitle';
import { LandingLanguageSelector } from '../components/LandingPage/LandingLanguageSelector';
import { NotificationContainer } from '../components/NotificationContainer';
import { Seo } from '../components/Seo';
import {
  buildTelemetryPayload,
  buildTrackedAppPath,
  persistTelemetryAttribution,
  readTelemetryAttributionFromSearch,
  trackLandingEvent,
} from '../services/landingInstrumentation';
import {
  buildToolPagePath,
  DEFAULT_LOCALE,
  getLocaleDisplayName,
  getLocaleHomePath,
  getToolPageConfig,
  type SupportedLocale,
  type ToolPageKey,
} from './toolPageConfigs';
import { GUIDE_PAGE_ROUTES, getGuidePageConfig } from './guidePageConfigs';

interface ToolLandingPageProps {
  pageKey: ToolPageKey;
  locale: SupportedLocale;
}

const HOME_ANIMATED_HERO_STATIC_TITLE = 'Group Generator - Random, Balanced & Multi-Round';

export default function ToolLandingPage({ pageKey, locale }: ToolLandingPageProps) {
  const config = getToolPageConfig(pageKey, locale);
  const usesAnimatedHomeTitle = config.key === 'home' && config.locale === 'en';
  const heroHeadingText = usesAnimatedHomeTitle ? HOME_ANIMATED_HERO_STATIC_TITLE : config.hero.title;
  const embeddableToolRef = useRef<EmbeddableToolHandle>(null);
  const location = useLocation();
  const languageOptions = useMemo(
    () =>
      config.liveLocales.map((liveLocale) => ({
        locale: liveLocale,
        label: getLocaleDisplayName(liveLocale),
        to: `${buildToolPagePath(liveLocale, pageKey, config.slug)}${location.search}`,
      })),
    [config.liveLocales, config.slug, location.search, pageKey],
  );
  const guideLinks = useMemo(() => {
    if (config.locale !== DEFAULT_LOCALE) {
      return [];
    }

    return GUIDE_PAGE_ROUTES.map((route) => {
      const guideConfig = getGuidePageConfig(route.key);
      return {
        key: route.key,
        href: guideConfig.canonicalPath,
        title: guideConfig.hero.title,
        description: guideConfig.hero.intro,
      };
    });
  }, [config.locale]);
  const telemetryAttribution = useMemo(
    () =>
      readTelemetryAttributionFromSearch({
        search: location.search,
        fallbackLandingSlug: pageKey,
      }),
    [location.search, pageKey],
  );
  const useCasesGridClassName = config.sectionSet === 'technical'
    ? 'mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3'
    : 'mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
  const advancedGridClassName = config.sectionSet === 'technical'
    ? 'mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4'
    : 'mt-8 grid gap-4 sm:grid-cols-2';

  useEffect(() => {
    persistTelemetryAttribution(telemetryAttribution);
  }, [telemetryAttribution]);

  useEffect(() => {
    trackLandingEvent(
      'landing_view',
      buildTelemetryPayload(
        {
          pageKey,
          canonicalPath: config.canonicalPath,
          preset: config.defaultPreset,
          locale: config.locale,
          audience: config.inventory.audience,
          pageExperimentLabel: config.experiment.label,
        },
        telemetryAttribution,
      ),
    );
  }, [
    config.canonicalPath,
    config.defaultPreset,
    config.experiment.label,
    config.inventory.audience,
    config.locale,
    pageKey,
    telemetryAttribution,
  ]);

  const openAdvancedWorkspace = (target?: 'results' | 'people') => {
    embeddableToolRef.current?.openAdvancedWorkspace(target);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <Seo
        title={config.seo.title}
        description={config.seo.description}
        canonicalPath={config.canonicalPath}
        faqEntries={config.faqEntries}
        locale={config.locale}
        alternates={config.alternates}
      />

      <AppHeader
        homeTo={getLocaleHomePath(config.locale)}
        logoAlt="GroupMixer logo"
        titleAs="div"
        desktopBreakpoint="landing"
        utilityRailFramed={false}
        renderDesktopActions={() => (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => openAdvancedWorkspace()}
              className="btn-secondary hidden sm:inline-flex items-center gap-1.5"
            >
              {config.chrome.expertWorkspaceLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        renderDesktopUtilityActions={() => (
          <LandingLanguageSelector
            currentLocale={config.locale}
            options={languageOptions}
            variant="header"
          />
        )}
        renderMobileActions={() => (
          <>
            <button
              type="button"
              onClick={() => openAdvancedWorkspace()}
              className="btn-secondary flex items-center justify-center gap-1.5 w-full"
            >
              {config.chrome.expertWorkspaceLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        renderMobileUtilityActions={() => (
          <LandingLanguageSelector
            currentLocale={config.locale}
            options={languageOptions}
            className="h-10 w-full appearance-none rounded-md border pl-9 pr-8 text-sm font-medium outline-none transition-colors"
          />
        )}
      />

      <main>
        <section className="px-4 pb-8 pt-4 sm:px-6 lg:pb-14 lg:pt-6">
          <div className="mx-auto grid max-w-7xl gap-5 lg:gap-6">
            <div data-testid="landing-hero" className="order-1 min-w-0 max-w-4xl">
              <h1 className={usesAnimatedHomeTitle ? 'sr-only' : [
                'block w-full max-w-full overflow-hidden text-ellipsis font-bold leading-[1.08] tracking-normal sm:text-4xl lg:leading-[1.15]',
                'whitespace-nowrap text-[1.15rem] min-[340px]:text-[1.38rem] min-[390px]:text-2xl',
              ].join(' ')}>
                {heroHeadingText}
              </h1>
              {usesAnimatedHomeTitle ? (
                <div
                  data-testid="landing-home-hero-animation"
                  aria-hidden="true"
                  className="block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-bold leading-[1.08] tracking-normal text-base min-[340px]:text-[1.08rem] min-[390px]:text-xl sm:text-4xl lg:leading-[1.15]"
                >
                  <HomeAnimatedHeroTitle />
                </div>
              ) : null}
            </div>

            <EmbeddableTool ref={embeddableToolRef} pageKey={pageKey} locale={locale} />
          </div>
        </section>

        <section className="border-t px-4 pb-12 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-tight">{config.useCasesSection.title}</h2>
            <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
              {config.useCasesSection.description}
            </p>

            <div className={useCasesGridClassName}>
              {config.useCasesSection.cards.map((item) => (
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
            <h2 className="text-2xl font-semibold tracking-tight">{config.advancedSection.title}</h2>
            <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
              {config.advancedSection.description}
            </p>

            <div className={advancedGridClassName}>
              {config.advancedSection.cards.map((item) => (
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
                onClick={() => openAdvancedWorkspace()}
                className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
              >
                <Users className="h-4 w-4" />
                {config.advancedSection.buttonLabel}
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {config.advancedSection.supportingText}
              </p>
            </div>
          </div>
        </section>

        {guideLinks.length > 0 ? (
          <section className="border-t px-4 pb-12 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="mx-auto max-w-6xl">
              <h2 className="text-2xl font-semibold tracking-tight">Guides</h2>
              <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                Practical playbooks for workshops, classrooms, and repeated group assignments.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {guideLinks.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    className="rounded-xl border p-5 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    <h3 className="text-base font-semibold">{link.title}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {link.description}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="border-t px-4 pb-14 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">{config.chrome.faqHeading}</h2>
            <QuickSetupFaq entries={config.faqEntries} />
          </div>
        </section>
      </main>

      <LandingFooter
        expertWorkspaceTo={buildTrackedAppPath('/app', telemetryAttribution)}
        expertWorkspaceLabel={config.chrome.expertWorkspaceLabel}
        tagline={config.chrome.footerTagline}
        feedbackLabel={config.chrome.feedbackLabel}
        privacyNote={config.chrome.privacyNote}
      />
      <NotificationContainer />
    </div>
  );
}
