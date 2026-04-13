import { Link } from 'react-router-dom';

interface SiteLegalLinksProps {
  className?: string;
  linkClassName?: string;
}

export function SiteLegalLinks({
  className = 'flex flex-wrap items-center gap-4',
  linkClassName = 'transition-colors hover:opacity-80',
}: SiteLegalLinksProps) {
  return (
    <div className={className}>
      <Link to="/legal#offenlegung" className={linkClassName}>
        Offenlegung
      </Link>
      <Link to="/legal#privacy" className={linkClassName}>
        Datenschutz
      </Link>
    </div>
  );
}
