import type React from 'react';
import { Filter, Search } from 'lucide-react';

type ScenarioFilterMode = 'all' | 'templates' | 'scenarios';

interface ScenarioManagerFiltersProps {
  children?: React.ReactNode;
  filterTemplate: ScenarioFilterMode;
  searchTerm: string;
  onFilterTemplateChange: (value: ScenarioFilterMode) => void;
  onSearchTermChange: (value: string) => void;
}

export function ScenarioManagerFilters({
  children,
  filterTemplate,
  searchTerm,
  onFilterTemplateChange,
  onSearchTermChange,
}: ScenarioManagerFiltersProps) {
  return (
    <div className="p-4 sm:p-6 border-b" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search scenarios..."
            className="input pl-10 w-full text-base py-3"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter style={{ color: 'var(--text-tertiary)' }} className="h-4 w-4" />
          <select
            className="input text-base py-3"
            value={filterTemplate}
            onChange={(event) => onFilterTemplateChange(event.target.value as ScenarioFilterMode)}
          >
            <option value="all">All</option>
            <option value="scenarios">Scenarios</option>
            <option value="templates">Templates</option>
          </select>
        </div>
      </div>
      {children}
    </div>
  );
}
