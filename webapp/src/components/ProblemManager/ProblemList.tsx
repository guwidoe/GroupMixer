import React from 'react';
import {
  FileText,
  Star,
  Users,
  Layers,
  Calendar,
  BarChart3,
  Edit3,
  Copy,
  Download,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import type { ProblemSummary } from '../../types';

interface ProblemListProps {
  problems: ProblemSummary[];
  searchTerm: string;
  selectedProblemId: string | null;
  editingId: string | null;
  editingName: string;
  setEditingName: React.Dispatch<React.SetStateAction<string>>;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onRenameStart: (id: string, currentName: string) => void;
  onLoadProblem: (id: string) => void;
  onDuplicate: (id: string, name: string) => void;
  onToggleTemplate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function ProblemList({
  problems,
  searchTerm,
  selectedProblemId,
  editingId,
  editingName,
  setEditingName,
  onSaveRename,
  onCancelRename,
  onRenameStart,
  onLoadProblem,
  onDuplicate,
  onToggleTemplate,
  onExport,
  onDelete,
}: ProblemListProps) {
  if (problems.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          No problems found
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {searchTerm ? 'Try adjusting your search terms.' : 'Create your first problem to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {problems.map((problem) => (
        <div
          key={problem.id}
          className={`card hover:shadow-md transition-shadow cursor-pointer ${
            problem.id === selectedProblemId ? 'ring-2 ring-blue-500' : ''
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              {editingId === problem.id ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    className="input text-sm flex-1"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveRename();
                      if (e.key === 'Escape') onCancelRename();
                    }}
                    autoFocus
                  />
                  <button onClick={onSaveRename} className="text-green-600 hover:text-green-700 p-1">
                    <Save className="h-4 w-4" />
                  </button>
                  <button onClick={onCancelRename} className="text-red-600 hover:text-red-700 p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2" onClick={() => onLoadProblem(problem.id)}>
                  <h3 className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {problem.name}
                  </h3>
                  {problem.isTemplate && <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
                </div>
              )}
            </div>
          </div>

          <div
            className="grid grid-cols-2 gap-2 text-sm mb-3"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => onLoadProblem(problem.id)}
          >
            <div className="flex items-center space-x-1">
              <Users className="h-3 w-3" />
              <span>{problem.peopleCount} people</span>
            </div>
            <div className="flex items-center space-x-1">
              <Layers className="h-3 w-3" />
              <span>{problem.groupsCount} groups</span>
            </div>
            <div className="flex items-center space-x-1">
              <Calendar className="h-3 w-3" />
              <span>{problem.sessionsCount} sessions</span>
            </div>
            <div className="flex items-center space-x-1">
              <BarChart3 className="h-3 w-3" />
              <span>{problem.resultsCount} results</span>
            </div>
          </div>

          <div className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
            <div>Created: {formatDate(problem.createdAt)}</div>
            <div>Updated: {formatDate(problem.updatedAt)}</div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameStart(problem.id, problem.name);
                }}
                className="p-1 transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                title="Rename"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(problem.id, problem.name);
                }}
                className="p-1 transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                title="Duplicate"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTemplate(problem.id);
                }}
                className="p-1 transition-colors"
                style={{ color: problem.isTemplate ? 'var(--color-warning-500)' : 'var(--text-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = problem.isTemplate ? 'var(--color-warning-500)' : 'var(--text-tertiary)')
                }
                title={problem.isTemplate ? 'Remove from templates' : 'Add to templates'}
              >
                <Star className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExport(problem.id);
                }}
                className="p-1 transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                title="Export"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(problem.id);
                }}
                className="p-1 transition-colors"
                style={{ color: 'var(--color-error-400)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error-600)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-error-400)')}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
