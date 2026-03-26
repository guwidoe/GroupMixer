import React from 'react';

interface CreateScenarioDialogProps {
  open: boolean;
  mode: 'duplicate' | 'empty';
  newScenarioName: string;
  setNewScenarioName: React.Dispatch<React.SetStateAction<string>>;
  newScenarioIsTemplate: boolean;
  setNewScenarioIsTemplate: React.Dispatch<React.SetStateAction<boolean>>;
  onCreate: () => void;
  onCancel: () => void;
}

export function CreateScenarioDialog({
  open,
  mode,
  newScenarioName,
  setNewScenarioName,
  newScenarioIsTemplate,
  setNewScenarioIsTemplate,
  onCreate,
  onCancel,
}: CreateScenarioDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-60 p-4">
      <div className="rounded-lg shadow-xl p-6 w-full max-w-md mx-auto modal-content">
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          {mode === 'empty' ? 'Create New Scenario' : 'Duplicate Current Scenario'}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Scenario Name
            </label>
            <input
              type="text"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              className="input w-full text-base py-3"
              placeholder="Enter scenario name..."
              autoFocus
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isTemplate"
              checked={newScenarioIsTemplate}
              onChange={(e) => setNewScenarioIsTemplate(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="isTemplate" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Save as template
            </label>
          </div>
        </div>
        <div
          className="flex flex-col sm:flex-row justify-end gap-3 mt-6 pt-4 border-t"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <button onClick={onCancel} className="btn-secondary flex-1 sm:flex-none px-6 py-3 text-base font-medium">
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={!newScenarioName.trim()}
            className="btn-primary flex-1 sm:flex-none px-6 py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
