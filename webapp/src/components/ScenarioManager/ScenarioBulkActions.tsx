import { CheckSquare, Download, Square, Trash2 } from 'lucide-react';

interface ScenarioBulkActionsProps {
  allCount: number;
  filteredCount: number;
  filteredSelectedCount: number;
  hasActiveFilter: boolean;
  selectedCount: number;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onExportSelected: () => void;
  onSelectAll: () => void;
  onSelectFiltered: () => void;
}

export function ScenarioBulkActions({
  allCount,
  filteredCount,
  filteredSelectedCount,
  hasActiveFilter,
  selectedCount,
  onClearSelection,
  onDeleteSelected,
  onExportSelected,
  onSelectAll,
  onSelectFiltered,
}: ScenarioBulkActionsProps) {
  return (
    <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
          disabled={allCount === 0}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Select all
        </button>
        <button
          type="button"
          onClick={onSelectFiltered}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
          disabled={filteredCount === 0}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Select filtered
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
          disabled={selectedCount === 0}
        >
          <Square className="h-3.5 w-3.5" />
          Clear
        </button>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {selectedCount} selected
          {hasActiveFilter ? ` · ${filteredSelectedCount}/${filteredCount} visible selected` : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExportSelected}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
          disabled={selectedCount === 0}
        >
          <Download className="h-3.5 w-3.5" />
          Export selected
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
          disabled={selectedCount === 0}
          style={selectedCount === 0 ? undefined : { color: 'var(--color-error-600)' }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete selected
        </button>
      </div>
    </div>
  );
}
