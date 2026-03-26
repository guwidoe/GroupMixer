import { Languages } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SupportedLocale } from '../../pages/toolPageConfigs';

interface LandingLanguageSelectorProps {
  currentLocale: SupportedLocale;
  ariaLabel?: string;
  options: Array<{
    locale: SupportedLocale;
    label: string;
    to: string;
  }>;
}

export function LandingLanguageSelector({
  currentLocale,
  ariaLabel = 'Language',
  options,
}: LandingLanguageSelectorProps) {
  const navigate = useNavigate();

  if (options.length <= 1) {
    return null;
  }

  return (
    <div className="relative">
      <Languages
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: 'var(--text-secondary)' }}
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
        className="appearance-none rounded-lg border py-2 pl-9 pr-8 text-sm outline-none transition-colors"
        style={{
          borderColor: 'var(--border-primary)',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
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
