import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, ChevronRight, Hash, Users, Zap } from 'lucide-react';
import { useAppStore } from '../../store';
import { Tooltip } from '../Tooltip';
import type { DemoCaseWithMetrics } from './types';
import { useOutsideClick } from '../../hooks';
import { getButtonClassName } from '../ui';
import { GENERATED_DEMO_CASE_ID, GENERATED_DEMO_CASE_NAME } from '../../services/demoScenarioGenerator';

interface DemoDataDropdownProps {
  onDemoCaseClick: (demoCaseId: string, demoCaseName: string) => void;
  variant?: 'default' | 'sidebar' | 'header' | 'menu';
  placement?: 'bottom' | 'right';
  collapsed?: boolean;
  triggerLabel?: string;
  popupOwnerId?: string;
  loadCases?: () => Promise<DemoCaseWithMetrics[]>;
  includeGeneratedDemo?: boolean;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function DemoDataDropdown({
  onDemoCaseClick,
  variant = 'default',
  placement = 'bottom',
  collapsed = false,
  triggerLabel = 'Demo Data',
  popupOwnerId,
  loadCases,
  includeGeneratedDemo = true,
}: DemoDataDropdownProps) {
  const addNotification = useAppStore((state) => state.addNotification);
  const demoDropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isTriggerHovered, setIsTriggerHovered] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const [demoCasesWithMetrics, setDemoCasesWithMetrics] = useState<DemoCaseWithMetrics[]>([]);
  const [loadingDemoMetrics, setLoadingDemoMetrics] = useState(false);

  const updateDropdownPosition = useCallback(() => {
    if (!demoDropdownRef.current) {
      return;
    }

    const triggerRect = demoDropdownRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const preferredWidth = placement === 'right' ? 360 : 320;
    const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
    const measuredMenuHeight = dropdownMenuRef.current?.offsetHeight ?? 384;

    if (placement === 'right') {
      const availableRight = window.innerWidth - triggerRect.right - viewportPadding - gap;
      const availableLeft = triggerRect.left - viewportPadding - gap;
      const openLeft = availableRight < Math.min(width, preferredWidth) && availableLeft > availableRight;
      const left = openLeft
        ? Math.max(viewportPadding, triggerRect.left - width - gap)
        : Math.min(triggerRect.right + gap, window.innerWidth - width - viewportPadding);
      const maxHeight = Math.max(180, window.innerHeight - triggerRect.top - viewportPadding);
      const top = Math.max(
        viewportPadding,
        Math.min(triggerRect.top, window.innerHeight - Math.min(measuredMenuHeight, maxHeight) - viewportPadding),
      );

      setDropdownPosition({
        top,
        left,
        width,
        maxHeight,
      });
      return;
    }

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
  }, [placement]);

  useOutsideClick({
    refs: [demoDropdownRef, dropdownMenuRef],
    onOutsideClick: () => setIsOpen(false),
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen && demoCasesWithMetrics.length === 0 && !loadingDemoMetrics) {
      setLoadingDemoMetrics(true);
      (loadCases
        ? loadCases()
        : import('../../services/demoDataService').then((module) => module.loadDemoCasesWithMetrics()))
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
  }, [isOpen, demoCasesWithMetrics.length, loadingDemoMetrics, addNotification, loadCases]);

  useEffect(() => {
    if (!isOpen) {
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
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      updateDropdownPosition();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, demoCasesWithMetrics.length, loadingDemoMetrics, updateDropdownPosition]);

  const sidebarTrigger = (
    <button
      type="button"
      onClick={() => setIsOpen((open) => !open)}
      className={`flex w-full items-center rounded-md text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)] ${
        collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2 text-left'
      }`}
      style={{
        backgroundColor: isOpen ? 'var(--bg-tertiary)' : 'transparent',
        color: isOpen ? 'var(--color-accent)' : 'var(--text-secondary)',
      }}
      aria-expanded={isOpen}
      aria-haspopup="menu"
      aria-label="Demo Data"
    >
      <Zap
        className="h-4 w-4 shrink-0"
        style={{ color: isOpen ? 'var(--color-accent)' : 'var(--text-tertiary)' }}
      />
      {!collapsed && <span className="truncate">Demo Data</span>}
      {!collapsed && <ChevronRight className="ml-auto h-4 w-4 shrink-0" />}
    </button>
  );

  const trigger = variant === 'sidebar' ? (
    <Tooltip content="Demo Data" className="block w-full" placement="right" disabled={isOpen}>
      {sidebarTrigger}
    </Tooltip>
  ) : (
    <button
      onClick={() => setIsOpen((open) => !open)}
      onMouseEnter={() => setIsTriggerHovered(true)}
      onMouseLeave={() => setIsTriggerHovered(false)}
      className={variant === 'menu'
        ? 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors'
        : getButtonClassName({ variant: variant === 'header' ? 'toolbar' : 'secondary', size: variant === 'header' ? 'md' : 'lg' })}
      style={{
        outline: 'none',
        boxShadow: 'none',
        backgroundColor: variant === 'menu'
          ? isOpen || isTriggerHovered
            ? 'var(--bg-secondary)'
            : 'transparent'
          : variant === 'header'
          ? isOpen || isTriggerHovered
            ? 'var(--bg-primary)'
            : 'transparent'
          : isOpen
            ? 'var(--bg-tertiary)'
            : 'var(--bg-primary)',
        borderColor: variant === 'header' ? 'transparent' : undefined,
        color:
          variant === 'menu'
            ? isOpen || isTriggerHovered
              ? 'var(--text-primary)'
              : 'var(--text-primary)'
            : variant === 'header' && isTriggerHovered
              ? 'var(--text-primary)'
              : undefined,
      }}
      aria-expanded={isOpen}
      aria-haspopup="menu"
      aria-label={triggerLabel}
    >
      <Zap className="w-4 h-4 flex-shrink-0" style={{ color: variant === 'menu' ? 'var(--text-tertiary)' : undefined }} />
      <span>{triggerLabel}</span>
      <ChevronDown
        className={`w-4 h-4 flex-shrink-0 ${variant === 'menu' ? 'ml-auto' : ''}`}
        style={{ color: variant === 'menu' ? 'var(--text-tertiary)' : undefined }}
      />
    </button>
  );

  return (
    <>
      <div className="relative" ref={demoDropdownRef}>
        {trigger}
      </div>

      {isOpen && dropdownPosition && createPortal(
        <div
          ref={dropdownMenuRef}
          data-outside-click-owner={popupOwnerId}
          className="theme-scrollbar fixed z-50 overflow-y-auto rounded-md border shadow-lg"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            maxHeight: dropdownPosition.maxHeight,
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
          }}
          role="menu"
          aria-label="Demo data cases"
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
              {includeGeneratedDemo ? (
                <div className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onDemoCaseClick(GENERATED_DEMO_CASE_ID, GENERATED_DEMO_CASE_NAME);
                    }}
                    className="flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors"
                    style={{
                      color: 'var(--text-primary)',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    role="menuitem"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Zap className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                      <span>{GENERATED_DEMO_CASE_NAME}</span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Pick groups, people per group, and sessions. We will generate random people and group names with one repeat-pairing constraint.
                    </p>
                  </button>
                </div>
              ) : null}

              {(['Simple', 'Intermediate', 'Advanced', 'Benchmark'] as const).map((category) => {
                const casesInCategory = demoCasesWithMetrics.filter((c) => c.category === category);
                if (casesInCategory.length === 0) return null;

                return (
                  <div key={category}>
                    <div
                      className="border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500"
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
                        onClick={() => {
                          setIsOpen(false);
                          onDemoCaseClick(demoCase.id, demoCase.name);
                        }}
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
                        role="menuitem"
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
