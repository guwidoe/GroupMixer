import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import MainApp from './MainApp';
import { useThemeStore } from './store/theme';
import { ProblemEditor } from './components/ProblemEditor';
import { SolverPanel } from './components/SolverPanel';
import { ResultsView } from './components/ResultsView';
import { ResultsHistory } from './components/ResultsHistory';
import { ManualEditor } from './components/ManualEditor';

function App() {
  const { theme } = useThemeStore();

  return (
    <div className={theme}>
      <Routes>
        <Route path="/" element={<Navigate to="/landingpage" />} />
        <Route path="/landingpage" element={<LandingPage />} />
        <Route path="/app" element={<MainApp />}>
          <Route index element={<Navigate to="problem/people" replace />} />
          <Route path="problem" element={<Navigate to="/app/problem/people" replace />} />
          <Route path="problem/:section" element={<ProblemEditor />} />
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
