import { ChevronDown, Languages } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SupportedLocale } from '../../pages/toolPageConfigs';
import { getButtonClassName } from '../ui';

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

  if (isHeaderVariant) {
    return (
      <div className="landing-header-language-control relative h-10 w-10 min-w-10">
        <span
          aria-hidden="true"
          className={[
            'landing-header-language-control__surface',
            getButtonClassName({ variant: 'toolbar', size: 'icon' }),
            'h-10 w-10 min-h-10 min-w-10 rounded-xl p-0',
          ].join(' ')}
        >
          <Languages className="h-4 w-4" />
        </span>
        <select
          aria-label={ariaLabel}
          value={currentLocale}
          onChange={(event) => {
            const selected = options.find((option) => option.locale === event.target.value);
            if (selected) {
              navigate(selected.to);
            }
          }}
          className={[
            'landing-header-language-selector',
            'absolute inset-0 h-10 w-10 cursor-pointer appearance-none opacity-0',
            className,
          ].filter(Boolean).join(' ')}
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

  const resolvedClassName = className ?? 'landing-action-button h-10 appearance-none rounded-lg border pl-9 pr-8 text-sm outline-none';
  const resolvedStyle = {
    borderColor: 'var(--border-primary)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="relative min-w-0">
      <Languages
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
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
        className={resolvedClassName}
        style={resolvedStyle}
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
