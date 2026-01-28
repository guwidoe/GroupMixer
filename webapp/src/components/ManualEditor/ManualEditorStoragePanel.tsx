import React from 'react';
import { Archive, LockOpen } from 'lucide-react';
import type { Constraint, Problem } from '../../types';
import PersonCard from '../PersonCard';

interface ManualEditorStoragePanelProps {
  activeSession: number;
  storedIds: string[];
  effectiveProblem: Problem;
  pulledConstraints: Constraint[];
  isPersonLocked: (personId: string) => boolean;
  onDropToStorage: (personId: string) => void;
  onRemoveFromStorage: (personId: string) => void;
  setDraggingPerson: React.Dispatch<React.SetStateAction<string | null>>;
}

export function ManualEditorStoragePanel({
  activeSession,
  storedIds,
  effectiveProblem,
  pulledConstraints,
  isPersonLocked,
  onDropToStorage,
  onRemoveFromStorage,
  setDraggingPerson,
}: ManualEditorStoragePanelProps) {
  const onDropHandler = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const personId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    if (!personId) return;
    if (isPersonLocked(personId)) return;
    onDropToStorage(personId);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="w-full lg:w-64 flex-shrink-0 space-y-3">
      <div
        className="rounded-lg border p-3"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Storage · Session {activeSession + 1}
          </div>
          <Archive className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
        </div>
        <div
          className="p-2 rounded border min-h-[120px]"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
          onDragOver={onDragOver}
          onDrop={onDropHandler}
        >
          {storedIds.length === 0 ? (
            <div className="text-xs italic" style={{ color: 'var(--text-tertiary)' }}>
              Drag people here to temporarily remove from this session
            </div>
          ) : (
            <div className="space-y-2">
              {storedIds.map((pid) => {
                const person = effectiveProblem.people.find((p) => p.id === pid);
                if (!person) return null;
                const dragStart = (e: React.DragEvent) => {
                  if (isPersonLocked(pid)) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData('text/plain', pid);
                  e.dataTransfer.setData('text', pid);
                  try {
                    e.dataTransfer.effectAllowed = 'move';
                  } catch {}
                  setDraggingPerson(pid);
                };
                const dragEnd = () => {
                  setDraggingPerson(null);
                };
                return (
                  <div key={pid} draggable onDragStart={dragStart} onDragEnd={dragEnd} className="flex items-center justify-between pointer-events-auto">
                    <PersonCard person={person} />
                    <button
                      onClick={() => onRemoveFromStorage(pid)}
                      className="ml-2 px-2 py-1 rounded text-xs border"
                      title="Remove from storage"
                      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
                    >
                      <LockOpen className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        className="rounded-lg border p-3"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
          New Constraints
        </div>
        {pulledConstraints.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            None
          </div>
        ) : (
          <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {pulledConstraints.map((c, idx) => (
              <div
                key={idx}
                className="px-2 py-1 rounded border"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {c.type}
                </span>
                <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}></span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Pulled from current problem configuration compared to the result's snapshot.
        </div>
      </div>
    </div>
  );
}
