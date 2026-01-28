import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, Hash, Users, Zap } from 'lucide-react';
import { useAppStore } from '../../store';
import type { DemoCaseWithMetrics } from './types';
import { useOutsideClick } from '../../hooks';

interface DemoDataDropdownProps {
  onDemoCaseClick: (demoCaseId: string, demoCaseName: string) => void;
}

export function DemoDataDropdown({ onDemoCaseClick }: DemoDataDropdownProps) {
  const { demoDropdownOpen, setDemoDropdownOpen, addNotification } = useAppStore();
  const demoDropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [demoCasesWithMetrics, setDemoCasesWithMetrics] = useState<DemoCaseWithMetrics[]>([]);
  const [loadingDemoMetrics, setLoadingDemoMetrics] = useState(false);

  useOutsideClick({
    refs: [demoDropdownRef, dropdownMenuRef],
    onOutsideClick: () => setDemoDropdownOpen(false),
    enabled: demoDropdownOpen,
  });

  useEffect(() => {
    if (demoDropdownOpen && demoCasesWithMetrics.length === 0 && !loadingDemoMetrics) {
      setLoadingDemoMetrics(true);
      import('../../services/demoDataService')
        .then(module => module.loadDemoCasesWithMetrics())
        .then(cases => {
          setDemoCasesWithMetrics(cases);
        })
        .catch(error => {
          console.error('Failed to load demo cases with metrics:', error);
          addNotification({
            type: 'error',
            title: 'Demo Cases Load Failed',
            message: 'Failed to load demo case metrics',
          });
        })
        .finally(() => {
          setLoadingDemoMetrics(false);
        });
    }
  }, [demoDropdownOpen, demoCasesWithMetrics.length, loadingDemoMetrics, addNotification]);

  useEffect(() => {
    if (demoDropdownOpen && demoDropdownRef.current) {
      const rect = demoDropdownRef.current.getBoundingClientRect();
      const dropdownWidth = 320;
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.right - dropdownWidth + window.scrollX,
      });
    }
  }, [demoDropdownOpen]);

  return (
    <>
      <div className="relative" ref={demoDropdownRef}>
        <button
          onClick={() => setDemoDropdownOpen(!demoDropdownOpen)}
          className="flex items-center gap-1 sm:gap-2 justify-center px-1.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors btn-secondary min-w-0 text-xs sm:text-sm focus-visible:outline-none"
          style={{ outline: 'none', boxShadow: 'none' }}
        >
          <Zap className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
          <span>Demo Data</span>
          <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
        </button>
      </div>

      {demoDropdownOpen && dropdownPosition && createPortal(
        <div
          ref={dropdownMenuRef}
          className="fixed z-50 w-80 rounded-md shadow-lg border overflow-hidden max-h-96 overflow-y-auto"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          {loadingDemoMetrics ? (
            <div className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>
              <div
                className="inline-block animate-spin rounded-full h-4 w-4 border-b-2"
                style={{ borderColor: 'var(--color-accent)' }}
              ></div>
              <span className="ml-2 text-sm">Loading demo cases...</span>
            </div>
          ) : (
            <>
              {(['Simple', 'Intermediate', 'Advanced', 'Benchmark'] as const).map((category) => {
                const casesInCategory = demoCasesWithMetrics.filter((c) => c.category === category);
                if (casesInCategory.length === 0) return null;

                return (
                  <div key={category}>
                    <div
                      className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {category}
                    </div>
                    {casesInCategory.map((demoCase) => (
                      <button
                        key={demoCase.id}
                        onClick={() => onDemoCaseClick(demoCase.id, demoCase.name)}
                        className="flex flex-col w-full px-3 py-3 text-left transition-colors border-b last:border-b-0"
                        style={{
                          color: 'var(--text-primary)',
                          backgroundColor: 'transparent',
                          borderColor: 'var(--border-primary)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{demoCase.name}</span>
                          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            <Users className="w-3 h-3" />
                            <span>{demoCase.peopleCount}</span>
                            <Hash className="w-3 h-3 ml-1" />
                            <span>{demoCase.groupCount}</span>
                            <Calendar className="w-3 h-3 ml-1" />
                            <span>{demoCase.sessionCount}</span>
                          </div>
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {demoCase.description}
                        </p>
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
