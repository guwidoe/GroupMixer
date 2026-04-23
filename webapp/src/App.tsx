/* eslint-disable react/no-multi-comp */
import React, { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ManualEditor } from './components/ManualEditor';
import { ScenarioEditor } from './components/ScenarioEditor/ScenarioEditor';
import { PeopleGridPerformanceHarness } from './components/ScenarioEditor/perf/PeopleGridPerformanceHarness';
import { ResultsHistory } from './components/ResultsHistory';
import { ResultsView } from './components/ResultsView';
import { SolverWorkspace } from './components/SolverWorkspace/SolverWorkspace';
import MainApp from './MainApp';
import ToolLandingPage from './pages/ToolLandingPage';
import LegalPage from './pages/LegalPage';
import GuidePage from './pages/GuidePage';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, TOOL_PAGE_ROUTES } from './pages/toolPageConfigs';
import { GUIDE_PAGE_ROUTES } from './pages/guidePageConfigs';
import { getScenarioSetupPath, resolveScenarioSetupSection } from './components/ScenarioEditor/navigation/scenarioSetupNav';
import { useAppStore } from './store';
import { initializeThemeStore, useThemeStore } from './store/theme';

function SetupRouteRedirect() {
  const lastScenarioSetupSection = useAppStore((state) => state.ui.lastScenarioSetupSection);

  return <Navigate to={getScenarioSetupPath(lastScenarioSetupSection)} replace />;
}

function LegacySetupRouteRedirect() {
  const { section } = useParams<{ section?: string }>();
  return <Navigate to={getScenarioSetupPath(section ? resolveScenarioSetupSection(section) : null)} replace />;
}

function SolverRouteRedirect() {
  const advancedModeEnabled = useAppStore((state) => state.ui.advancedModeEnabled ?? false);
  const solution = useAppStore((state) => state.solution);
  const lastScenarioSetupSection = useAppStore((state) => state.ui.lastScenarioSetupSection);

  if (!advancedModeEnabled) {
    return <Navigate to={solution ? '/app/results' : getScenarioSetupPath(lastScenarioSetupSection)} replace />;
  }

  return <Navigate to="/app/solver/run" replace />;
}

function SolverRouteGuard() {
  const advancedModeEnabled = useAppStore((state) => state.ui.advancedModeEnabled ?? false);
  const solution = useAppStore((state) => state.solution);
  const lastScenarioSetupSection = useAppStore((state) => state.ui.lastScenarioSetupSection);

  if (!advancedModeEnabled) {
    return <Navigate to={solution ? '/app/results' : getScenarioSetupPath(lastScenarioSetupSection)} replace />;
  }

  return <SolverWorkspace />;
}

function App() {
  const { theme } = useThemeStore();
  const showPerformanceRoutes = import.meta.env?.DEV ?? false;

  useEffect(() => initializeThemeStore(), []);

  return (
    <div className={theme}>
      <Routes>
        {TOOL_PAGE_ROUTES.map(({ key, locale, path }) => (
          <Route key={`${locale}:${key}`} path={path} element={<ToolLandingPage pageKey={key} locale={locale} />} />
        ))}
        {GUIDE_PAGE_ROUTES.map(({ key, path }) => (
          <Route key={`guide:${key}`} path={path} element={<GuidePage pageKey={key} />} />
        ))}
        <Route path="/legal" element={<LegalPage locale={DEFAULT_LOCALE} />} />
        {SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map((locale) => (
          <Route key={`legal:${locale}`} path={`/${locale}/legal`} element={<LegalPage locale={locale} />} />
        ))}
        <Route path="/landingpage" element={<Navigate to="/" replace />} />
        <Route path="/app" element={<MainApp />}>
          <Route index element={<SetupRouteRedirect />} />
          <Route path="problem" element={<SetupRouteRedirect />} />
          <Route path="problem/:section" element={<LegacySetupRouteRedirect />} />
          <Route path="scenario" element={<SetupRouteRedirect />} />
          <Route path="scenario/:section" element={<ScenarioEditor />} />
          <Route path="solver" element={<SolverRouteRedirect />} />
          <Route path="solver/:section" element={<SolverRouteGuard />} />
          <Route path="results" element={<ResultsView />} />
          <Route path="editor" element={<ManualEditor />} />
          <Route path="history" element={<ResultsHistory />} />
          {showPerformanceRoutes ? <Route path="perf/people-grid" element={<PeopleGridPerformanceHarness />} /> : null}
        </Route>
      </Routes>
    </div>
  );
}

export default App;
