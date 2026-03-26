import { Link } from 'react-router-dom';
import { FolderOpen, Bug, Menu, X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { useAppStore } from '../store';
import { useState } from 'react';

export function Header() {
  const assetBaseUrl = import.meta.env?.BASE_URL ?? '/';
  const { currentScenarioId, savedScenarios, setShowScenarioManager } = useAppStore();
  const currentScenarioName = currentScenarioId ? savedScenarios[currentScenarioId]?.name : null;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="relative z-40 bg-white shadow-sm border-b border-gray-200 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="container mx-auto px-4 py-3">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="flex items-center space-x-2">
                <img src={assetBaseUrl + 'logo.svg'} alt="GroupMixer Logo" className="h-8 w-8" />
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
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          
          {/* Desktop layout */}
          <div className="hidden sm:flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            {!currentScenarioName && (
              <button
                onClick={() => setShowScenarioManager(true)}
                className="btn-secondary flex items-center space-x-2 w-full sm:w-auto justify-center sm:justify-start"
                title="Manage scenarios"
              >
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Manage Scenarios</span>
                <span className="sm:hidden">Manage</span>
              </button>
            )}
            {currentScenarioName && (
              <div className="hidden sm:flex items-center space-x-2 text-sm p-2 rounded-md" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                <FolderOpen className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                <span className="hidden md:inline">
                  Current: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{currentScenarioName}</span>
                </span>
                <button
                  onClick={() => setShowScenarioManager(true)}
                  className="ml-1 text-sm font-medium transition-colors hover:opacity-80"
                  style={{ color: 'var(--color-accent)' }}
                >
                  (Manage)
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Link to="/" className="flex items-center space-x-2 text-sm transition-colors p-2 rounded-md hover:bg-opacity-50 flex-1 sm:flex-none justify-center sm:justify-start" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
                <span className="hidden lg:inline">Tool Home</span>
                <span className="lg:hidden">Home</span>
              </Link>

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
              {!currentScenarioName && (
                <button
                  onClick={() => {
                    setShowScenarioManager(true);
                    setMobileMenuOpen(false);
                  }}
                  className="btn-secondary flex items-center space-x-2 w-full justify-start"
                  title="Manage scenarios"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>Manage Scenarios</span>
                </button>
              )}
              {currentScenarioName && (
                <div className="flex items-center space-x-2 text-sm p-2 rounded-md" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  <FolderOpen className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                  <span>
                    Current: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{currentScenarioName}</span>
                  </span>
                  <button
                    onClick={() => {
                      setShowScenarioManager(true);
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
                <Link
                  to="/"
                  className="flex items-center space-x-2 text-sm transition-colors p-2 rounded-md flex-1 justify-start"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>Tool Home</span>
                </Link>

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
