import React from 'react';
import { SetupEmptyState } from './SetupEmptyState';
import { SetupSectionHeader } from './SetupSectionHeader';
import { SetupSectionToolbar } from './SetupSectionToolbar';
import { SetupViewModeToggle } from './SetupViewModeToggle';
import { useSetupCollectionViewMode, type SetupCollectionViewMode } from './useSetupCollectionViewMode';
import { useAppStore } from '../../../store';

interface SetupCollectionPageProps {
  sectionKey: string;
  title: string;
  count: number;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  toolbarLeading?: React.ReactNode | ((viewMode: SetupCollectionViewMode) => React.ReactNode);
  toolbarTrailing?: React.ReactNode | ((viewMode: SetupCollectionViewMode) => React.ReactNode);
  summary?: React.ReactNode;
  defaultViewMode?: SetupCollectionViewMode;
  onViewModeChange?: (viewMode: SetupCollectionViewMode) => void;
  hasItems: boolean;
  emptyState: {
    icon?: React.ReactNode;
    title: string;
    message: React.ReactNode;
  };
  renderContent: (viewMode: SetupCollectionViewMode) => React.ReactNode;
}

export function SetupCollectionPage({
  sectionKey,
  title,
  count,
  description,
  actions,
  toolbarLeading,
  toolbarTrailing,
  summary,
  defaultViewMode = 'cards',
  onViewModeChange,
  hasItems,
  emptyState,
  renderContent,
}: SetupCollectionPageProps) {
  const { viewMode, setViewMode } = useSetupCollectionViewMode(sectionKey, defaultViewMode);
  const onViewModeChangeRef = React.useRef(onViewModeChange);
  const setupGridUnsaved = useAppStore((state) => state.setupGridUnsaved);
  const setupGridLeaveHook = useAppStore((state) => state.setupGridLeaveHook);
  const resolvedToolbarLeading = typeof toolbarLeading === 'function' ? toolbarLeading(viewMode) : toolbarLeading;
  const resolvedToolbarTrailing = typeof toolbarTrailing === 'function' ? toolbarTrailing(viewMode) : toolbarTrailing;
  const hasDedicatedToolbarContent = Boolean(resolvedToolbarLeading || resolvedToolbarTrailing);
  const requestViewModeChange = React.useCallback((nextMode: SetupCollectionViewMode) => {
    if (nextMode === viewMode) {
      return;
    }

    const continueAction = () => setViewMode(nextMode);
    if (viewMode === 'list' && setupGridUnsaved && setupGridLeaveHook) {
      setupGridLeaveHook(continueAction);
      return;
    }

    continueAction();
  }, [setViewMode, setupGridLeaveHook, setupGridUnsaved, viewMode]);
  const viewModeToggle = <SetupViewModeToggle viewMode={viewMode} onChange={requestViewModeChange} />;
  const headerActions = (
    <>
      {actions}
      {viewModeToggle}
    </>
  );

  React.useEffect(() => {
    onViewModeChangeRef.current = onViewModeChange;
  }, [onViewModeChange]);

  React.useEffect(() => {
    onViewModeChangeRef.current?.(viewMode);
  }, [viewMode]);

  return (
    <div className="space-y-5">
      <SetupSectionHeader title={title} count={count} description={description} actions={headerActions} />

      {hasDedicatedToolbarContent ? (
        <SetupSectionToolbar
          leading={resolvedToolbarLeading}
          trailing={resolvedToolbarTrailing}
        />
      ) : null}

      {summary ? (
        <div
          className="rounded-2xl border px-4 py-4"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          {summary}
        </div>
      ) : null}

      {hasItems ? renderContent(viewMode) : <SetupEmptyState icon={emptyState.icon} title={emptyState.title} message={emptyState.message} />}
    </div>
  );
}
