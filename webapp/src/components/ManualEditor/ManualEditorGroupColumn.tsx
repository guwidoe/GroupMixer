import React from 'react';
import { Lock, LockOpen } from 'lucide-react';
import type { Group, Problem } from '../../types';
import PersonCard from '../PersonCard';
import type { PreviewDelta } from './types';

interface ManualEditorGroupColumnProps {
  group: Group;
  activeSession: number;
  peopleIds: string[];
  effectiveProblem: Problem;
  draggingPerson: string | null;
  previewDelta: PreviewDelta | null;
  isGroupLocked: (groupId: string) => boolean;
  isPersonLocked: (personId: string) => boolean;
  onToggleGroupLock: (groupId: string) => void;
  onTogglePersonLock: (personId: string) => void;
  onDropPerson: (personId: string, targetGroupId: string, sessionId: number) => void;
  onPreview: (personId: string, targetGroupId: string, sessionId: number) => void;
  onClearPreview: () => void;
  setDraggingPerson: React.Dispatch<React.SetStateAction<string | null>>;
}

export function ManualEditorGroupColumn({
  group,
  activeSession,
  peopleIds,
  effectiveProblem,
  draggingPerson,
  previewDelta,
  isGroupLocked,
  isPersonLocked,
  onToggleGroupLock,
  onTogglePersonLock,
  onDropPerson,
  onPreview,
  onClearPreview,
  setDraggingPerson,
}: ManualEditorGroupColumnProps) {
  const overBy = Math.max(0, peopleIds.length - group.size);
  const headerColor = overBy > 0 ? 'text-red-600' : 'var(--text-primary)';

  const onDropHandler = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      console.debug('[ManualEditor] drop on', group.id, 'session', activeSession);
    } catch {}
    const personId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    if (!personId) return;
    onDropPerson(personId, group.id, activeSession);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    try {
      console.debug('[ManualEditor] dragover on', group.id);
    } catch {}
    if (draggingPerson) {
      onPreview(draggingPerson, group.id, activeSession);
    }
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggingPerson) {
      try {
        console.debug('[ManualEditor] dragenter on', group.id);
      } catch {}
      onPreview(draggingPerson, group.id, activeSession);
    }
  };

  const onDragLeave = () => {
    try {
      console.debug('[ManualEditor] dragleave on', group.id);
    } catch {}
    onClearPreview();
  };

  return (
    <div
      key={group.id}
      className="flex flex-col rounded-lg border"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color: headerColor }}>
            {group.id}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Capacity {peopleIds.length}/{group.size}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {draggingPerson && previewDelta && previewDelta.groupId === group.id && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium border"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            >
              <span className={previewDelta.scoreDelta <= 0 ? 'text-green-600' : 'text-red-600'}>
                Δscore {previewDelta.scoreDelta > 0 ? '+' : ''}{previewDelta.scoreDelta.toFixed(2)}
              </span>
              <span className="mx-1">·</span>
              <span className={previewDelta.uniqueDelta >= 0 ? 'text-green-600' : 'text-red-600'}>
                Δunique {previewDelta.uniqueDelta > 0 ? '+' : ''}{previewDelta.uniqueDelta}
              </span>
              <span className="mx-1">·</span>
              <span className={previewDelta.constraintDelta <= 0 ? 'text-green-600' : 'text-red-600'}>
                Δviol {previewDelta.constraintDelta > 0 ? '+' : ''}{previewDelta.constraintDelta}
              </span>
            </span>
          )}
          <button
            onClick={() => onToggleGroupLock(group.id)}
            className="px-2 py-1 rounded text-xs border"
            title={isGroupLocked(group.id) ? 'Unlock group' : 'Lock group'}
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
          >
            {isGroupLocked(group.id) ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div
        className="p-3 space-y-2 min-h-[120px]"
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDropHandler}
        onDragEnd={(e) => {
          e.preventDefault();
          setDraggingPerson(null);
          onClearPreview();
        }}
      >
        <div className="space-y-2 select-none">
          {peopleIds.map((pid) => {
            const person = effectiveProblem.people.find((p) => p.id === pid);
            if (!person) return null;
            const dragStart = (e: React.DragEvent) => {
              if (isPersonLocked(pid) || isGroupLocked(group.id)) {
                e.preventDefault();
                return;
              }
              e.dataTransfer.setData('text/plain', pid);
              e.dataTransfer.setData('text', pid);
              try {
                e.dataTransfer.effectAllowed = 'move';
              } catch {}
              try {
                console.debug('[ManualEditor] dragstart person', pid, 'from group', group.id, 'session', activeSession);
              } catch {}
              setDraggingPerson(pid);
            };
            const dragEnd = () => {
              setDraggingPerson(null);
              onClearPreview();
            };
            return (
              <div key={pid} draggable onDragStart={dragStart} onDragEnd={dragEnd} className="flex items-center justify-between pointer-events-auto">
                <PersonCard person={person} />
                <button
                  onClick={() => onTogglePersonLock(pid)}
                  className="ml-2 px-2 py-1 rounded text-xs border"
                  title={isPersonLocked(pid) ? 'Unlock person' : 'Lock person'}
                  style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
                >
                  {isPersonLocked(pid) ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="h-8" style={{ pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
