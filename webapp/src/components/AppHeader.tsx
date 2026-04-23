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
  desktopBreakpoint?: 'sm' | 'md' | 'lg' | 'landing';
  hideDesktopUtilityRail?: boolean;
  renderDesktopCenterContent?: () => ReactNode;
  renderMobileCenterContent?: (helpers: { closeMobileMenu: () => void }) => ReactNode;
  renderDesktopActions?: () => ReactNode;
  renderMobileActions?: (helpers: { closeMobileMenu: () => void }) => ReactNode;
  renderDesktopUtilityActions?: () => ReactNode;
  renderMobileUtilityActions?: (helpers: { closeMobileMenu: () => void }) => ReactNode;
  issueHref?: string;
  issueLabel?: string;
}

export function AppHeader({
  homeTo = '/',
  title = 'GroupMixer',
  logoAlt = 'GroupMixer Logo',
  desktopBreakpoint = 'sm',
  hideDesktopUtilityRail = false,
  renderDesktopCenterContent,
  renderMobileCenterContent,
  renderDesktopActions,
  renderMobileActions,
  renderDesktopUtilityActions,
  renderMobileUtilityActions,
  issueHref = 'https://github.com/guwidoe/GroupMixer/issues',
  issueLabel = 'Report an issue or suggest a feature',
}: AppHeaderProps) {
  const assetBaseUrl = import.meta.env?.BASE_URL ?? '/';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const desktopCenterContent = renderDesktopCenterContent?.();
  const mobileCenterContent = renderMobileCenterContent?.({ closeMobileMenu });
  const desktopActions = renderDesktopActions?.();
  const mobileActions = renderMobileActions?.({ closeMobileMenu });
  const desktopUtilityActions = renderDesktopUtilityActions?.();
  const mobileUtilityActions = renderMobileUtilityActions?.({ closeMobileMenu });
  const responsiveClasses = {
    sm: {
      headerLayout: 'flex flex-col gap-3 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4',
      menuButton: 'sm:hidden',
      desktopCenter: 'hidden min-w-0 sm:block',
      desktopActions: 'hidden sm:flex items-center justify-end gap-2 sm:gap-3',
      mobileMenu: 'sm:hidden mt-3 pt-3 border-t',
      mobileDivider: 'my-1 h-px w-full sm:hidden',
    },
    md: {
      headerLayout: 'flex flex-col gap-3 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-4',
      menuButton: 'md:hidden',
      desktopCenter: 'hidden min-w-0 md:block',
      desktopActions: 'hidden md:flex items-center justify-end gap-2 md:gap-3',
      mobileMenu: 'md:hidden mt-3 pt-3 border-t',
      mobileDivider: 'my-1 h-px w-full md:hidden',
    },
    lg: {
      headerLayout: 'flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-4',
      menuButton: 'lg:hidden',
      desktopCenter: 'hidden min-w-0 lg:block',
      desktopActions: 'hidden lg:flex items-center justify-end gap-2 lg:gap-3',
      mobileMenu: 'lg:hidden mt-3 pt-3 border-t',
      mobileDivider: 'my-1 h-px w-full lg:hidden',
    },
    landing: {
      headerLayout: 'flex flex-col gap-3 min-[700px]:grid min-[700px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[700px]:items-center min-[700px]:gap-4',
      menuButton: 'min-[700px]:hidden',
      desktopCenter: 'hidden min-w-0 min-[700px]:block',
      desktopActions: 'hidden min-[700px]:flex items-center justify-end gap-2 min-[700px]:gap-3',
      mobileMenu: 'min-[700px]:hidden mt-3 pt-3 border-t',
      mobileDivider: 'my-1 h-px w-full min-[700px]:hidden',
    },
  }[desktopBreakpoint];

  return (
    <header
      className="relative z-40 border-b transition-colors backdrop-blur-xl"
      style={{ backgroundColor: 'var(--header-surface)', borderColor: 'var(--border-primary)' }}
    >
      <div className="w-full px-4 py-3 sm:px-6 lg:px-8">
        <div className={responsiveClasses.headerLayout}>
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
              className={`${responsiveClasses.menuButton} p-2 rounded-md transition-colors`}
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

          <div className={responsiveClasses.desktopCenter}>
            {desktopCenterContent}
          </div>

          <div className={responsiveClasses.desktopActions}>
            {desktopActions}

            {!hideDesktopUtilityRail ? (
              <div className={HEADER_ACTION_GROUP_CLASS}>
                <div
                  className={HEADER_ACTION_TOOLBAR_CLASS}
                  style={{ backgroundColor: 'var(--header-rail-surface)', borderColor: 'var(--border-primary)' }}
                >
                  {desktopUtilityActions}
                  {desktopUtilityActions ? (
                    <div
                      className={HEADER_ACTION_DIVIDER_CLASS}
                      style={{ backgroundColor: 'var(--border-primary)' }}
                      aria-hidden="true"
                    />
                  ) : null}
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
            ) : null}
          </div>
        </div>

        {mobileMenuOpen && (
          <div className={responsiveClasses.mobileMenu} style={{ borderColor: 'var(--border-primary)' }}>
            <div className="flex flex-col gap-2">
              {mobileCenterContent}
              {mobileActions}

              <div className={HEADER_ACTION_GROUP_CLASS}>
                <div
                  className={HEADER_ACTION_TOOLBAR_CLASS}
                  style={{ backgroundColor: 'var(--header-rail-surface)', borderColor: 'var(--border-primary)' }}
                >
                  {mobileUtilityActions}
                  {mobileUtilityActions ? (
                    <div
                      className={responsiveClasses.mobileDivider}
                      style={{ backgroundColor: 'var(--border-primary)' }}
                      aria-hidden="true"
                    />
                  ) : null}
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
