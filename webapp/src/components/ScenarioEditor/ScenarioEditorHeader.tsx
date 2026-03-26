import React from 'react';
import { Save, Upload } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { DemoDataDropdown } from './DemoDataDropdown';

interface ScenarioEditorHeaderProps {
  onLoadScenario: () => void;
  onSaveScenario: () => void;
  onDemoCaseClick: (demoCaseId: string, demoCaseName: string) => void;
  collapsed?: boolean;
}

export function ScenarioEditorHeader({
  onLoadScenario,
  onSaveScenario,
  onDemoCaseClick,
  collapsed = false,
}: ScenarioEditorHeaderProps) {
  if (collapsed) {
    return (
      <div className="space-y-1">
        <Tooltip content="Load" className="block w-full" placement="right">
          <button
            type="button"
            onClick={onLoadScenario}
            className="flex w-full items-center justify-center rounded-md py-2 transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Load"
          >
            <Upload className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </Tooltip>

        <Tooltip content="Save" className="block w-full" placement="right">
          <button
            type="button"
            onClick={onSaveScenario}
            className="flex w-full items-center justify-center rounded-md py-2 transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Save"
          >
            <Save className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </Tooltip>

        <DemoDataDropdown
          onDemoCaseClick={onDemoCaseClick}
          variant="sidebar"
          placement="right"
          collapsed
        />
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <Tooltip content="Load" className="block w-full" placement="right">
        <button
          type="button"
          onClick={onLoadScenario}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Load"
        >
          <Upload className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <span className="truncate">Load</span>
        </button>
      </Tooltip>

      <Tooltip content="Save" className="block w-full" placement="right">
        <button
          type="button"
          onClick={onSaveScenario}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Save"
        >
          <Save className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <span className="truncate">Save</span>
        </button>
      </Tooltip>

      <DemoDataDropdown
        onDemoCaseClick={onDemoCaseClick}
        variant="sidebar"
        placement="right"
      />
    </div>
  );
}
