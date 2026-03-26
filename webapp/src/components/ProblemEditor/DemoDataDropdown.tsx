import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, Hash, Users, Zap } from 'lucide-react';
import { useAppStore } from '../../store';
import type { DemoCaseWithMetrics } from './types';
import { useOutsideClick } from '../../hooks';

interface DemoDataDropdownProps {
  onDemoCaseClick: (demoCaseId: string, demoCaseName: string) => void;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function DemoDataDropdown({ onDemoCaseClick }: DemoDataDropdownProps) {
  const { demoDropdownOpen, setDemoDropdownOpen, addNotification } = useAppStore();
  const demoDropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const [demoCasesWithMetrics, setDemoCasesWithMetrics] = useState<DemoCaseWithMetrics[]>([]);
  const [loadingDemoMetrics, setLoadingDemoMetrics] = useState(false);

  const updateDropdownPosition = useCallback(() => {
    if (!demoDropdownRef.current) {
      return;
    }

    const triggerRect = demoDropdownRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const preferredWidth = 320;
    const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
    const measuredMenuHeight = dropdownMenuRef.current?.offsetHeight ?? 384;

    const left = Math.max(
      viewportPadding,
      Math.min(triggerRect.right - width, window.innerWidth - width - viewportPadding),
    );

    const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding - gap;
    const availableAbove = triggerRect.top - viewportPadding - gap;
    const openAbove = availableBelow < Math.min(measuredMenuHeight, 280) && availableAbove > availableBelow;
    const maxHeight = Math.max(160, openAbove ? availableAbove : availableBelow);

    let top = openAbove
      ? triggerRect.top - Math.min(measuredMenuHeight, maxHeight) - gap
      : triggerRect.bottom + gap;

    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - maxHeight - viewportPadding));

    setDropdownPosition({
      top,
      left,
      width,
      maxHeight,
    });
  }, []);

  useOutsideClick({
    refs: [demoDropdownRef, dropdownMenuRef],
    onOutsideClick: () => setDemoDropdownOpen(false),
    enabled: demoDropdownOpen,
  });

  useEffect(() => {
    if (demoDropdownOpen && demoCasesWithMetrics.length === 0 && !loadingDemoMetrics) {
      setLoadingDemoMetrics(true);
      import('../../services/demoDataService')
        .then((module) => module.loadDemoCasesWithMetrics())
        .then((cases) => {
          setDemoCasesWithMetrics(cases);
        })
        .catch((error) => {
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
    if (!demoDropdownOpen) {
      setDropdownPosition(null);
      return;
    }

    updateDropdownPosition();

    const handleViewportChange = () => updateDropdownPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [demoDropdownOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!demoDropdownOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      updateDropdownPosition();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [demoDropdownOpen, demoCasesWithMetrics.length, loadingDemoMetrics, updateDropdownPosition]);

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
          className="fixed z-50 rounded-md border shadow-lg overflow-hidden overflow-y-auto"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            maxHeight: dropdownPosition.maxHeight,
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          {loadingDemoMetrics ? (
            <div className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>
              <div
                className="inline-block h-4 w-4 animate-spin rounded-full border-b-2"
                style={{ borderColor: 'var(--color-accent)' }}
              />
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
                      className="border-b px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50"
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
                        className="flex w-full flex-col border-b px-3 py-3 text-left transition-colors last:border-b-0"
                        style={{
                          color: 'var(--text-primary)',
                          backgroundColor: 'transparent',
                          borderColor: 'var(--border-primary)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-sm">{demoCase.name}</span>
                          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            <Users className="w-3 h-3" />
                            <span>{demoCase.peopleCount}</span>
                            <Hash className="ml-1 w-3 h-3" />
                            <span>{demoCase.groupCount}</span>
                            <Calendar className="ml-1 w-3 h-3" />
                            <span>{demoCase.sessionCount}</span>
                          </div>
                        </div>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
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
        document.body,
      )}
    </>
  );
}
