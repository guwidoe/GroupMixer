import React from 'react';
import { Gavel, Redo2, Save, Undo2, UserPlus } from 'lucide-react';
import type { Mode } from './types';

interface ManualEditorTopBarProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onPullNewPeople: () => void;
  onPullNewConstraints: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveDraft: () => void;
}

export function ManualEditorTopBar({
  mode,
  onModeChange,
  onPullNewPeople,
  onPullNewConstraints,
  onUndo,
  onRedo,
  onSaveDraft,
}: ManualEditorTopBarProps) {
  return (
    <div
      className="rounded-lg border p-3 mb-4 flex flex-wrap gap-2 items-center justify-between"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Mode:
        </span>
        <button
          onClick={() => onModeChange('strict')}
          className="px-2 py-1 rounded text-xs border"
          style={{
            color: mode === 'strict' ? 'var(--color-accent)' : 'var(--text-secondary)',
            borderColor: mode === 'strict' ? 'var(--color-accent)' : 'var(--border-primary)',
            backgroundColor: mode === 'strict' ? 'var(--bg-tertiary)' : 'transparent',
          }}
        >
          Strict
        </button>
        <button
          onClick={() => onModeChange('warn')}
          className="px-2 py-1 rounded text-xs border"
          style={{
            color: mode === 'warn' ? 'var(--color-accent)' : 'var(--text-secondary)',
            borderColor: mode === 'warn' ? 'var(--color-accent)' : 'var(--border-primary)',
            backgroundColor: mode === 'warn' ? 'var(--bg-tertiary)' : 'transparent',
          }}
        >
          Warn
        </button>
        <button
          onClick={() => onModeChange('free')}
          className="px-2 py-1 rounded text-xs border"
          style={{
            color: mode === 'free' ? 'var(--color-accent)' : 'var(--text-secondary)',
            borderColor: mode === 'free' ? 'var(--color-accent)' : 'var(--border-primary)',
            backgroundColor: mode === 'free' ? 'var(--bg-tertiary)' : 'transparent',
          }}
        >
          Free
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPullNewPeople}
          className="px-2 py-1 rounded text-xs border inline-flex items-center gap-1"
          title="Pull new people from current problem into storage for all relevant sessions"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
        >
          <UserPlus className="w-4 h-4" /> Pull new people
        </button>
        <button
          onClick={onPullNewConstraints}
          className="px-2 py-1 rounded text-xs border inline-flex items-center gap-1"
          title="Pull new constraints from current problem"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
        >
          <Gavel className="w-4 h-4" /> Pull constraints
        </button>
        <button
          onClick={onUndo}
          className="px-2 py-1 rounded text-xs border"
          title="Undo"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          className="px-2 py-1 rounded text-xs border"
          title="Redo"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
        >
          <Redo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onSaveDraft}
          className="px-2 py-1 rounded text-xs border"
          title="Save as new result"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
        >
          <Save className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
