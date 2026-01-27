import React from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import type { ProblemConfigDifference } from '../../services/problemStorage';

interface ConfigDiffBadgeProps {
  configDiff: ProblemConfigDifference;
  isOpen: boolean;
  onToggle: () => void;
  onRestoreConfig: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function ConfigDiffBadge({
  configDiff,
  isOpen,
  onToggle,
  onRestoreConfig,
  containerRef,
}: ConfigDiffBadgeProps) {
  if (!configDiff.isDifferent) return null;

  return (
    <div className="relative flex-shrink-0" ref={containerRef}>
      <button
        onClick={onToggle}
        className="config-details-badge inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border transition-colors"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: '#dc2626',
          color: '#dc2626',
        }}
      >
        <AlertTriangle className="h-3 w-3" />
        Different Config
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 z-10 p-3 rounded-lg border shadow-lg"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: '#dc2626',
            color: 'var(--text-primary)',
            minWidth: '320px',
            width: '100%',
            maxWidth: '90vw',
          }}
        >
          <div className="space-y-2">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="font-medium text-red-600">Different Problem Configuration</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              This result was created with a different problem setup than the most recent result and may not be directly comparable with the current configuration.
            </p>
            <div className="mt-2 space-y-1">
              {Object.entries(configDiff.details).map(([key, detail]) => (
                detail ? (
                  <div key={key} className="flex items-start space-x-2 text-xs">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 flex-shrink-0" />
                    <span style={{ color: 'var(--text-secondary)' }}>{detail}</span>
                  </div>
                ) : null
              ))}
            </div>
            <div className="pt-2">
              <button className="btn-primary w-full text-xs" onClick={onRestoreConfig}>
                Restore this result&apos;s configuration as new problem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
