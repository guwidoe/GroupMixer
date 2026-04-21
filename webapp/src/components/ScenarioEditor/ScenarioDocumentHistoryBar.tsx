import { Redo2, Undo2 } from 'lucide-react';
import { HEADER_ACTION_DIVIDER_CLASS, HEADER_ACTION_ICON_BUTTON_CLASS, HEADER_ACTION_TOOLBAR_CLASS } from '../headerActionStyles';

interface ScenarioDocumentHistoryBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

function buttonStyles(enabled: boolean) {
  return {
    color: enabled ? 'var(--text-primary)' : 'var(--text-tertiary)',
    opacity: enabled ? 1 : 0.55,
  };
}

export function ScenarioDocumentHistoryBar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ScenarioDocumentHistoryBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={HEADER_ACTION_TOOLBAR_CLASS}
        style={{ backgroundColor: 'var(--header-rail-surface)', borderColor: 'var(--border-primary)' }}
        aria-label="Scenario history controls"
      >
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={HEADER_ACTION_ICON_BUTTON_CLASS}
          style={buttonStyles(canUndo)}
          aria-label="Undo scenario setup change"
          title="Undo (Ctrl/Cmd+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <div
          className={HEADER_ACTION_DIVIDER_CLASS}
          style={{ backgroundColor: 'var(--border-primary)' }}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className={HEADER_ACTION_ICON_BUTTON_CLASS}
          style={buttonStyles(canRedo)}
          aria-label="Redo scenario setup change"
          title="Redo (Shift+Ctrl/Cmd+Z or Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
