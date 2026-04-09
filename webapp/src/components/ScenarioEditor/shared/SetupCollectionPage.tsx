import React from 'react';
import { SetupEmptyState } from './SetupEmptyState';
import { SetupSectionHeader } from './SetupSectionHeader';
import { SetupSectionToolbar } from './SetupSectionToolbar';
import { SetupViewModeToggle } from './SetupViewModeToggle';
import { useSetupCollectionViewMode, type SetupCollectionViewMode } from './useSetupCollectionViewMode';

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
  const resolvedToolbarLeading = typeof toolbarLeading === 'function' ? toolbarLeading(viewMode) : toolbarLeading;
  const resolvedToolbarTrailing = typeof toolbarTrailing === 'function' ? toolbarTrailing(viewMode) : toolbarTrailing;
  const hasDedicatedToolbarContent = Boolean(resolvedToolbarLeading || resolvedToolbarTrailing);
  const viewModeToggle = <SetupViewModeToggle viewMode={viewMode} onChange={setViewMode} />;
  const headerActions = hasDedicatedToolbarContent
    ? actions
    : (
      <>
        {actions}
        {viewModeToggle}
      </>
    );

  React.useEffect(() => {
    onViewModeChange?.(viewMode);
  }, [onViewModeChange, viewMode]);

  return (
    <div className="space-y-5">
      <SetupSectionHeader title={title} count={count} description={description} actions={headerActions} />

      {hasDedicatedToolbarContent ? (
        <SetupSectionToolbar
          leading={resolvedToolbarLeading}
          trailing={
            <>
              {resolvedToolbarTrailing}
              {viewModeToggle}
            </>
          }
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
