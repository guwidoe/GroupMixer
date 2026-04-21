import { Redo2, Undo2 } from 'lucide-react';

interface ScenarioDocumentHistoryBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

function buttonStyles(enabled: boolean) {
  return {
    color: enabled ? 'var(--text-primary)' : 'var(--text-tertiary)',
    borderColor: enabled ? 'var(--border-primary)' : 'var(--border-secondary)',
    opacity: enabled ? 1 : 0.65,
  };
}

export function ScenarioDocumentHistoryBar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ScenarioDocumentHistoryBarProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Scenario history
        </div>
        <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Undo/redo applies to Scenario Setup document edits only.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
          style={buttonStyles(canUndo)}
          aria-label="Undo scenario setup change"
          title="Undo (Ctrl/Cmd+Z)"
        >
          <Undo2 className="h-4 w-4" />
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
          style={buttonStyles(canRedo)}
          aria-label="Redo scenario setup change"
          title="Redo (Shift+Ctrl/Cmd+Z or Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
          Redo
        </button>
      </div>
    </div>
  );
}
