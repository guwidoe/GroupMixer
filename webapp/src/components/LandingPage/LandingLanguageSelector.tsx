import { ChevronDown, Languages } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SupportedLocale } from '../../pages/toolPageConfigs';

interface LandingLanguageSelectorProps {
  currentLocale: SupportedLocale;
  ariaLabel?: string;
  className?: string;
  variant?: 'default' | 'header';
  options: Array<{
    locale: SupportedLocale;
    label: string;
    to: string;
  }>;
}

export function LandingLanguageSelector({
  currentLocale,
  ariaLabel = 'Language',
  className,
  variant = 'default',
  options,
}: LandingLanguageSelectorProps) {
  const navigate = useNavigate();

  if (options.length <= 1) {
    return null;
  }

  const isHeaderVariant = variant === 'header';

  return (
    <div className="relative min-w-0">
      <Languages
        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 ${isHeaderVariant ? 'left-3' : 'left-3'}`}
        style={{ color: 'var(--text-secondary)' }}
      />
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: 'var(--text-tertiary)' }}
      />
      <select
        aria-label={ariaLabel}
        value={currentLocale}
        onChange={(event) => {
          const selected = options.find((option) => option.locale === event.target.value);
          if (selected) {
            navigate(selected.to);
          }
        }}
        className={className ?? (isHeaderVariant
          ? 'landing-header-language-selector h-10 min-w-[8.5rem] appearance-none rounded-xl border border-transparent pl-9 pr-9 text-sm font-medium outline-none transition-colors'
          : 'landing-action-button h-10 appearance-none rounded-lg border pl-9 pr-8 text-sm outline-none')}
        style={{
          borderColor: isHeaderVariant ? 'transparent' : 'var(--border-primary)',
          backgroundColor: isHeaderVariant ? 'transparent' : 'var(--bg-primary)',
          color: isHeaderVariant ? 'var(--text-secondary)' : 'var(--text-primary)',
        }}
      >
        {options.map((option) => (
          <option key={option.locale} value={option.locale}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
