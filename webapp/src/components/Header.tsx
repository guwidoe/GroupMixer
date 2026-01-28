import { Link } from 'react-router-dom';
import { FolderOpen, Bug, Menu, X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { useAppStore } from '../store';
import { useState } from 'react';

export function Header() {
  const { currentProblemId, savedProblems, setShowProblemManager } = useAppStore();
  const currentProblemName = currentProblemId ? savedProblems[currentProblemId]?.name : null;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="container mx-auto px-4 py-3">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div className="flex items-center justify-between">
            <Link to="/landingpage" className="flex items-center space-x-3 group">
              <div className="flex items-center space-x-2">
                <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="GroupMixer Logo" className="h-8 w-8" />
                <h1 className="text-2xl font-bold transition-colors" style={{ color: 'var(--text-primary)' }}>
                  GroupMixer
                </h1>
              </div>
            </Link>
            
            {/* Mobile hamburger menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden p-2 rounded-md transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          
          {/* Desktop layout */}
          <div className="hidden sm:flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            {!currentProblemName && (
              <button
                onClick={() => setShowProblemManager(true)}
                className="btn-secondary flex items-center space-x-2 w-full sm:w-auto justify-center sm:justify-start"
                title="Manage problems"
              >
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Manage Problems</span>
                <span className="sm:hidden">Manage</span>
              </button>
            )}
            {currentProblemName && (
              <div className="hidden sm:flex items-center space-x-2 text-sm p-2 rounded-md" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                <FolderOpen className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                <span className="hidden md:inline">
                  Current: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{currentProblemName}</span>
                </span>
                <button
                  onClick={() => setShowProblemManager(true)}
                  className="ml-1 text-sm font-medium transition-colors hover:opacity-80"
                  style={{ color: 'var(--color-accent)' }}
                >
                  (Manage)
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <a href="https://github.com/guwidoe/GroupMixer/issues" target="_blank" rel="noopener noreferrer" title="Report an issue or suggest a feature" className="flex items-center space-x-2 text-sm transition-colors p-2 rounded-md hover:bg-opacity-50 flex-1 sm:flex-none justify-center sm:justify-start" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
                <Bug className="h-4 w-4" />
                <span className="hidden lg:inline">Report Issue</span>
                <span className="lg:hidden">Issues</span>
              </a>
              
              <ThemeToggle size="md" />
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="flex flex-col gap-2">
              {!currentProblemName && (
                <button
                  onClick={() => {
                    setShowProblemManager(true);
                    setMobileMenuOpen(false);
                  }}
                  className="btn-secondary flex items-center space-x-2 w-full justify-start"
                  title="Manage problems"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>Manage Problems</span>
                </button>
              )}
              {currentProblemName && (
                <div className="flex items-center space-x-2 text-sm p-2 rounded-md" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  <FolderOpen className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                  <span>
                    Current: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{currentProblemName}</span>
                  </span>
                  <button
                    onClick={() => {
                      setShowProblemManager(true);
                      setMobileMenuOpen(false);
                    }}
                    className="ml-1 text-sm font-medium transition-colors hover:opacity-80"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    (Manage)
                  </button>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <a 
                  href="https://github.com/guwidoe/GroupMixer/issues" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  title="Report an issue or suggest a feature" 
                  className="flex items-center space-x-2 text-sm transition-colors p-2 rounded-md flex-1 justify-start" 
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Bug className="h-4 w-4" />
                  <span>Report Issue</span>
                </a>
                
                <div className="flex-shrink-0">
                  <ThemeToggle size="md" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
} 
