import React, { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ManualEditor } from './components/ManualEditor';
import { ScenarioEditor } from './components/ScenarioEditor/ScenarioEditor';
import { ResultsHistory } from './components/ResultsHistory';
import { ResultsView } from './components/ResultsView';
import { SolverPanel } from './components/SolverPanel';
import MainApp from './MainApp';
import ToolLandingPage from './pages/ToolLandingPage';
import { TOOL_PAGE_ROUTES } from './pages/toolPageConfigs';
import { initializeThemeStore, useThemeStore } from './store/theme';

function App() {
  const { theme } = useThemeStore();

  useEffect(() => initializeThemeStore(), []);

  return (
    <div className={theme}>
      <Routes>
        {TOOL_PAGE_ROUTES.map(({ key, locale, path }) => (
          <Route key={`${locale}:${key}`} path={path} element={<ToolLandingPage pageKey={key} locale={locale} />} />
        ))}
        <Route path="/landingpage" element={<Navigate to="/" replace />} />
        <Route path="/app" element={<MainApp />}>
          <Route index element={<Navigate to="scenario/people" replace />} />
          <Route path="problem" element={<Navigate to="/app/scenario/people" replace />} />
          <Route path="problem/:section" element={<Navigate to="/app/scenario/people" replace />} />
          <Route path="scenario" element={<Navigate to="/app/scenario/people" replace />} />
          <Route path="scenario/:section" element={<ScenarioEditor />} />
          <Route path="solver" element={<SolverPanel />} />
          <Route path="results" element={<ResultsView />} />
          <Route path="editor" element={<ManualEditor />} />
          <Route path="history" element={<ResultsHistory />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
