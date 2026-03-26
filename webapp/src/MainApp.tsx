import { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAppStore } from './store';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { ProblemManager } from './components/ProblemManager';
import { ResultComparison } from './components/ResultComparison';
import { NotificationContainer } from './components/NotificationContainer';

function MainApp() {
  const { ui, problem, currentProblemId, initializeApp, setShowProblemManager } = useAppStore();

  // Initialize app on start
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  return (
    <div className="min-h-screen transition-colors" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <Header />
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {problem && !currentProblemId && (
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
        )}

        {/* Navigation */}
        <div className="mb-6">
          <Navigation />
        </div>

        {/* Content Area */}
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>

      {/* Notifications */}
      <NotificationContainer />

      {/* Problem Manager Modal */}
      <ProblemManager 
        isOpen={ui.showProblemManager} 
        onClose={() => setShowProblemManager(false)} 
      />

      {/* Result Comparison Modal */}
      {ui.showResultComparison && <ResultComparison />}
    </div>
  );
}

export default MainApp; 
