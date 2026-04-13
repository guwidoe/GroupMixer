import { Link, useLocation } from 'react-router-dom';
import { getLegalContent, buildLegalPath, resolveLegalPathLocale } from '../legal/legalContent';

interface SiteLegalLinksProps {
  className?: string;
  linkClassName?: string;
}

export function SiteLegalLinks({
  className = 'flex flex-wrap items-center gap-4',
  linkClassName = 'transition-colors hover:opacity-80',
}: SiteLegalLinksProps) {
  const location = useLocation();
  const locale = resolveLegalPathLocale(location.pathname);
  const content = getLegalContent(locale);
  const basePath = buildLegalPath(locale);

  return (
    <div className={className}>
      <Link to={`${basePath}#offenlegung`} className={linkClassName}>
        {content.legalNoticeLinkLabel}
      </Link>
      <Link to={`${basePath}#privacy`} className={linkClassName}>
        {content.privacyLinkLabel}
      </Link>
    </div>
  );
}
