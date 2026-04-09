import { type ReactNode, useState } from 'react';
import { Bug, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import {
  HEADER_ACTION_DIVIDER_CLASS,
  HEADER_ACTION_GROUP_CLASS,
  HEADER_ACTION_ICON_BUTTON_CLASS,
  HEADER_ACTION_TOOLBAR_CLASS,
} from './headerActionStyles';
import { getButtonClassName } from './ui';

interface AppHeaderProps {
  homeTo?: string;
  title?: string;
  logoAlt?: string;
  renderDesktopActions?: () => ReactNode;
  renderMobileActions?: (helpers: { closeMobileMenu: () => void }) => ReactNode;
  issueHref?: string;
  issueLabel?: string;
}

export function AppHeader({
  homeTo = '/',
  title = 'GroupMixer',
  logoAlt = 'GroupMixer Logo',
  renderDesktopActions,
  renderMobileActions,
  issueHref = 'https://github.com/guwidoe/GroupMixer/issues',
  issueLabel = 'Report an issue or suggest a feature',
}: AppHeaderProps) {
  const assetBaseUrl = import.meta.env?.BASE_URL ?? '/';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const desktopActions = renderDesktopActions?.();
  const mobileActions = renderMobileActions?.({ closeMobileMenu });

  return (
    <header
      className="relative z-40 border-b transition-colors backdrop-blur-xl"
      style={{ backgroundColor: 'var(--bg-backdrop)', borderColor: 'var(--border-primary)' }}
    >
      <div className="w-full px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div className="flex items-center justify-between">
            <Link to={homeTo} className="flex items-center space-x-3 group min-w-0">
              <div className="flex items-center space-x-2 min-w-0">
                <img src={assetBaseUrl + 'logo.svg'} alt={logoAlt} className="h-8 w-8" />
                <h1 className="truncate text-[1.85rem] font-semibold tracking-[-0.03em] transition-colors" style={{ color: 'var(--text-primary)' }}>
                  {title}
                </h1>
              </div>
            </Link>

            <button
              onClick={() => setMobileMenuOpen((current) => !current)}
              className="sm:hidden p-2 rounded-md transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <div className="hidden sm:ml-auto sm:flex items-center gap-2 sm:gap-3">
            {desktopActions}

            <div className={HEADER_ACTION_GROUP_CLASS}>
              <div
                className={HEADER_ACTION_TOOLBAR_CLASS}
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
              >
                <a
                  href={issueHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={issueLabel}
                  aria-label={issueLabel}
                  className={HEADER_ACTION_ICON_BUTTON_CLASS}
                >
                  <Bug className="h-4 w-4" />
                </a>
                <div
                  className={HEADER_ACTION_DIVIDER_CLASS}
                  style={{ backgroundColor: 'var(--border-primary)' }}
                  aria-hidden="true"
                />
                <ThemeToggle size="md" variant="header" />
              </div>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="sm:hidden mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="flex flex-col gap-2">
              {mobileActions}

              <div className={HEADER_ACTION_GROUP_CLASS}>
                <div
                  className={HEADER_ACTION_TOOLBAR_CLASS}
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
                >
                  <a
                    href={issueHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={issueLabel}
                    className={getButtonClassName({ variant: 'toolbar', size: 'md' })}
                    onClick={closeMobileMenu}
                  >
                    <Bug className="h-4 w-4" />
                    <span>Report Issue</span>
                  </a>

                  <div className="flex-shrink-0">
                    <ThemeToggle size="md" variant="header" showHeaderLabel />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
