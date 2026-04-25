import { ArrowRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { GuidePageLink } from '../../pages/guidePageConfigs';

interface GuideRelatedLinkGridProps {
  links: GuidePageLink[];
  columns: 'two' | 'three';
}

export function GuideRelatedLinkGrid({ links, columns }: GuideRelatedLinkGridProps) {
  return (
    <div className={columns === 'three' ? 'mt-6 grid gap-4 md:grid-cols-3' : 'mt-6 grid gap-4 md:grid-cols-2'}>
      {links.map((link) => (
        <Link
          key={link.href}
          to={link.href}
          className="group rounded-lg border p-5 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            '--tw-ring-color': 'var(--color-accent)',
            '--tw-ring-offset-color': 'var(--bg-secondary)',
          } as CSSProperties}
        >
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-base font-semibold leading-tight">{link.label}</h3>
            <ArrowRight
              className="mt-0.5 h-4 w-4 shrink-0 transition group-hover:translate-x-0.5"
              style={{ color: 'var(--text-tertiary)' }}
              aria-hidden="true"
            />
          </div>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {link.description}
          </p>
        </Link>
      ))}
    </div>
  );
}
