import { Link } from 'react-router-dom';

interface LandingFooterProps {
  expertWorkspaceTo?: string;
  expertWorkspaceLabel?: string;
  tagline?: string;
  feedbackLabel?: string;
  privacyNote?: string;
}

export function LandingFooter({
  expertWorkspaceTo = '/app',
  expertWorkspaceLabel = 'Expert workspace',
  tagline = 'GroupMixer — Free random group generator',
  feedbackLabel = 'Feedback',
  privacyNote = 'All processing happens locally in your browser.',
}: LandingFooterProps) {
  const assetBaseUrl = import.meta.env?.BASE_URL ?? '/';
  return (
    <footer
      className="border-t px-4 py-8 sm:px-6"
      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <img src={assetBaseUrl + 'logo.svg'} alt="" className="h-5 w-5" />
            <span>{tagline}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Link to={expertWorkspaceTo} className="transition-colors hover:opacity-80">
              {expertWorkspaceLabel}
            </Link>
            <a
              href="https://github.com/guwidoe/GroupMixer"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:opacity-80"
            >
              GitHub
            </a>
            <a
              href="https://github.com/guwidoe/GroupMixer/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:opacity-80"
            >
              {feedbackLabel}
            </a>
          </div>
        </div>
        <p className="mt-4 text-center text-xs sm:text-left" style={{ color: 'var(--text-secondary)' }}>
          © {new Date().getFullYear()} Guido Witt-Dörring. {privacyNote}
        </p>
      </div>
    </footer>
  );
}
