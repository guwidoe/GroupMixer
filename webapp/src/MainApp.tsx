import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { NotificationContainer } from './components/NotificationContainer';
import { ScenarioManager } from './components/ScenarioManager';
import { ResultComparison } from './components/ResultComparison';
import { Seo } from './components/Seo';
import { WorkflowGuideButton } from './components/workflow/WorkflowGuideButton';
import { SiteLegalLinks } from './components/SiteLegalLinks';
import { SITE_LEGAL_CONFIG } from './legal/legalConfig';
import { getAppSeo } from './seo/appRouteSeo';
import { useAppStore } from './store';

function MainApp() {
  const { ui, scenario, currentScenarioId, initializeApp, setShowScenarioManager } = useAppStore();
  const location = useLocation();
  const headerRef = useRef<HTMLDivElement>(null);
  const [workspaceShellHeight, setWorkspaceShellHeight] = useState<string>('20rem');
  const seo = getAppSeo(location.pathname);
  const isWorkspaceRoute = location.pathname.startsWith('/app/scenario') || location.pathname.startsWith('/app/solver');

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  useLayoutEffect(() => {
    if (!isWorkspaceRoute) {
      return;
    }

    const updateWorkspaceShellHeight = () => {
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
      const chromeHeight = Math.ceil(headerHeight);
      const nextHeight = `max(20rem, calc(100vh - ${chromeHeight}px))`;
      setWorkspaceShellHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    };

    updateWorkspaceShellHeight();

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          updateWorkspaceShellHeight();
        });

    if (resizeObserver && headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    window.addEventListener('resize', updateWorkspaceShellHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateWorkspaceShellHeight);
    };
  }, [isWorkspaceRoute]);

  return (
    <div className="flex min-h-screen flex-col transition-colors" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <Seo
        title={seo.title}
        description={seo.description}
        canonicalPath={location.pathname}
        indexable={false}
        includeStructuredData={false}
      />

      <div ref={headerRef}>
        <Header
          renderDesktopCenterContent={() => <Navigation variant="embedded" />}
          renderMobileCenterContent={({ closeMobileMenu }) => (
            <Navigation variant="mobile-menu" closeMobileMenu={closeMobileMenu} />
          )}
        />
      </div>

      <main
        className={isWorkspaceRoute
          ? 'w-full px-4 py-4 md:flex md:h-[var(--workspace-shell-height)] md:flex-col md:overflow-hidden md:px-0 md:py-0'
          : 'container mx-auto w-full flex-1 px-4 py-6'}
        style={isWorkspaceRoute ? ({ '--workspace-shell-height': workspaceShellHeight } as CSSProperties) : undefined}
      >
        {scenario && !currentScenarioId && (
          <div className={isWorkspaceRoute ? 'px-4 pt-6' : ''}>
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

        <div className={isWorkspaceRoute ? 'animate-fade-in md:min-h-0 md:flex-1' : 'animate-fade-in mt-6'}>
          <Outlet />
        </div>
      </main>

      <footer
        className="border-t px-4 py-4 sm:px-6"
        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between" style={{ color: 'var(--text-secondary)' }}>
          <div>© {new Date().getFullYear()} {SITE_LEGAL_CONFIG.ownerName}</div>
          <SiteLegalLinks linkClassName="transition-colors hover:opacity-80" />
        </div>
      </footer>

      <WorkflowGuideButton />

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
