import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Zap } from 'lucide-react';
import type { SavedScenario } from '../../../types';

interface WarmStartPanelProps {
  savedScenarios: Record<string, SavedScenario>;
  currentScenarioId: string | null;
  warmStartSelection: string | null;
  setWarmStartSelection: React.Dispatch<React.SetStateAction<string | null>>;
  setWarmStartFromResult: (id: string | null) => void;
}

export function WarmStartPanel({
  savedScenarios,
  currentScenarioId,
  warmStartSelection,
  setWarmStartSelection,
  setWarmStartFromResult,
}: WarmStartPanelProps) {
  const [warmDropdownOpen, setWarmDropdownOpen] = useState(false);
  const warmDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (warmDropdownOpen && target && warmDropdownRef.current && !warmDropdownRef.current.contains(target)) {
        setWarmDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [warmDropdownOpen]);

  const selectedLabel = (() => {
    if (!warmStartSelection) {
      return 'Start from random (default)';
    }

    const result = currentScenarioId
      ? savedScenarios[currentScenarioId]?.results.find((item) => item.id === warmStartSelection)
      : undefined;

    return result ? `${result.name || 'Result'} • score ${result.solution.final_score.toFixed(2)}` : 'Start from random (default)';
  })();

  return (
    <section
      className="rounded-2xl border p-4"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Warm Start
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Optionally start from an existing saved result instead of a random schedule.
        </p>
      </div>

      <div className="relative" ref={warmDropdownRef}>
        <button
          onClick={() => setWarmDropdownOpen(!warmDropdownOpen)}
          className="btn-secondary flex w-full items-center justify-between gap-2 px-3 py-2 text-sm"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Zap className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{selectedLabel}</span>
          </div>
          <ChevronDown className="h-3 w-3" />
        </button>

        {warmDropdownOpen ? (
          <div
            className="absolute left-0 z-10 mt-1 max-h-72 w-full overflow-hidden overflow-y-auto rounded-md border shadow-lg"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
          >
            <button
              onClick={() => {
                setWarmStartSelection(null);
                setWarmStartFromResult(null);
                setWarmDropdownOpen(false);
              }}
              className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm transition-colors"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span>Start from random (default)</span>
            </button>

            {(() => {
              const list = currentScenarioId ? savedScenarios[currentScenarioId]?.results || [] : [];
              if (!list.length) {
                return (
                  <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    No results available
                  </div>
                );
              }

              const scores = list.map((result) => result.solution.final_score);
              const min = Math.min(...scores);
              const max = Math.max(...scores);
              const colorFor = (score: number) => {
                if (min === max) return 'text-green-600';
                const ratio = (score - min) / (max - min);
                if (ratio <= 0.15) return 'text-green-600';
                if (ratio <= 0.35) return 'text-lime-600';
                if (ratio <= 0.6) return 'text-yellow-600';
                if (ratio <= 0.85) return 'text-orange-600';
                return 'text-red-600';
              };

              return list
                .slice()
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      setWarmStartSelection(result.id);
                      setWarmStartFromResult(result.id);
                      setWarmDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0"
                    style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)', backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{result.name || 'Result'}</span>
                        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                          {new Date(result.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        iter {result.solution.iteration_count.toLocaleString()} • duration {(result.duration / 1000).toFixed(1)}s
                      </div>
                    </div>
                    <div className={`ml-3 font-semibold ${colorFor(result.solution.final_score)}`}>
                      {result.solution.final_score.toFixed(2)}
                    </div>
                  </button>
                ));
            })()}
          </div>
        ) : null}
      </div>
    </section>
  );
}
