import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Zap } from 'lucide-react';
import type { SavedProblem } from '../../../store/slices/problemManagerSlice';

interface WarmStartSelectorProps {
  savedProblems: Record<string, SavedProblem>;
  currentProblemId: string | null;
  warmStartSelection: string | null;
  setWarmStartSelection: React.Dispatch<React.SetStateAction<string | null>>;
  setWarmStartFromResult: (id: string | null) => void;
}

export function WarmStartSelector({
  savedProblems,
  currentProblemId,
  warmStartSelection,
  setWarmStartSelection,
  setWarmStartFromResult,
}: WarmStartSelectorProps) {
  const [warmDropdownOpen, setWarmDropdownOpen] = useState(false);
  const warmDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (warmDropdownOpen && target && warmDropdownRef.current && !warmDropdownRef.current.contains(target)) {
        setWarmDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [warmDropdownOpen]);

  const selectedLabel = (() => {
    if (!warmStartSelection) return 'Start from random (default)';
    const result = currentProblemId
      ? savedProblems[currentProblemId]?.results.find((item) => item.id === warmStartSelection)
      : undefined;
    return result ? `${result.name || 'Result'} • score ${result.solution.final_score.toFixed(2)}` : 'Start from random (default)';
  })();

  return (
    <div className="mb-4">
      <div
        className="p-3 rounded-lg"
        style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)' }}
      >
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Start from existing result (optional)
        </label>
        <div className="relative" ref={warmDropdownRef}>
          <button
            onClick={() => setWarmDropdownOpen(!warmDropdownOpen)}
            className="btn-secondary flex items-center justify-between gap-2 w-full px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{selectedLabel}</span>
            </div>
            <ChevronDown className="w-3 h-3" />
          </button>

          {warmDropdownOpen && (
            <div
              className="absolute left-0 mt-1 w-full rounded-md shadow-lg z-10 border overflow-hidden max-h-72 overflow-y-auto"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
            >
              <button
                onClick={() => {
                  setWarmStartSelection(null);
                  setWarmStartFromResult(null);
                  setWarmDropdownOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-left transition-colors border-b"
                style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Start from random (default)</span>
              </button>

              {(() => {
                const list = currentProblemId ? savedProblems[currentProblemId]?.results || [] : [];
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
                      className="flex w-full items-center justify-between px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                      style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)', backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{result.name || 'Result'}</span>
                          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                            {new Date(result.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
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
          )}
        </div>
      </div>
    </div>
  );
}
