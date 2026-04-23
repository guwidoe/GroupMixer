import { Redo2, Undo2 } from 'lucide-react';
import { getButtonClassName } from '../ui';

interface ScenarioDocumentHistoryBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const HISTORY_TOOLBAR_CLASS = 'flex items-center rounded-[1rem] border px-1 py-0.5';
const HISTORY_ICON_BUTTON_CLASS = [
  getButtonClassName({ variant: 'toolbar', size: 'icon' }),
  'h-9 w-9 min-h-9 min-w-9 rounded-[0.9rem] p-0',
].join(' ');

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
    <div
      className={HISTORY_TOOLBAR_CLASS}
      style={{ backgroundColor: 'var(--header-rail-surface)', borderColor: 'var(--border-primary)' }}
      aria-label="Scenario history controls"
    >
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className={HISTORY_ICON_BUTTON_CLASS}
        style={buttonStyles(canUndo)}
        aria-label="Undo scenario setup change"
        title="Undo (Ctrl/Cmd+Z)"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <div className="mx-0.5 h-4 w-px shrink-0" style={{ backgroundColor: 'var(--border-primary)' }} aria-hidden="true" />
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className={HISTORY_ICON_BUTTON_CLASS}
        style={buttonStyles(canRedo)}
        aria-label="Redo scenario setup change"
        title="Redo (Shift+Ctrl/Cmd+Z or Ctrl+Y)"
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}
