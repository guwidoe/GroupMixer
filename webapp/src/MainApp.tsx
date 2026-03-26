import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { NotificationContainer } from './components/NotificationContainer';
import { ScenarioManager } from './components/ScenarioManager';
import { ResultComparison } from './components/ResultComparison';
import { Seo } from './components/Seo';
import { buildTelemetryPayload, getActiveTelemetryAttribution, trackLandingEvent } from './services/landingInstrumentation';
import { getAppSeo } from './seo/appRouteSeo';
import { useAppStore } from './store';

function MainApp() {
  const { ui, scenario, currentScenarioId, initializeApp, setShowScenarioManager } = useAppStore();
  const location = useLocation();
  const hasTrackedAppEntryRef = useRef(false);
  const seo = getAppSeo(location.pathname);
  const isScenarioSetupRoute = location.pathname.startsWith('/app/scenario');

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    if (hasTrackedAppEntryRef.current) {
      return;
    }

    hasTrackedAppEntryRef.current = true;
    const attribution = getActiveTelemetryAttribution(location.search);
    trackLandingEvent(
      'app_entry',
      buildTelemetryPayload(
        {
          entryPath: location.pathname,
        },
        attribution,
      ),
    );
  }, [location.pathname, location.search]);

  return (
    <div className="flex min-h-screen flex-col transition-colors" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <Seo
        title={seo.title}
        description={seo.description}
        canonicalPath={location.pathname}
        indexable={false}
        includeStructuredData={false}
      />

      <Header />
      <Navigation />

      <main
        className={isScenarioSetupRoute
          ? 'w-full px-4 py-4 md:flex md:min-h-[20rem] md:flex-1 md:flex-col md:overflow-hidden md:px-0 md:py-0'
          : 'container mx-auto w-full flex-1 px-4 py-6'}
      >
        {scenario && !currentScenarioId && (
          <div className={isScenarioSetupRoute ? 'px-4 pt-6' : ''}>
            <div
              className="mb-6 flex flex-col gap-3 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Scratchpad workspace
                </div>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  This setup came from the landing tool and is not attached to an existing saved project yet.
                </p>
              </div>
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-medium"
                style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              >
                Back to tool home
              </Link>
            </div>
          </div>
        )}

        <div className={isScenarioSetupRoute ? 'animate-fade-in md:min-h-0 md:flex-1' : 'animate-fade-in mt-6'}>
          <Outlet />
        </div>
      </main>

      <NotificationContainer />

      <ScenarioManager
        isOpen={ui.showScenarioManager}
        onClose={() => setShowScenarioManager(false)}
      />

      {ui.showResultComparison && <ResultComparison />}
    </div>
  );
}

export default MainApp;
