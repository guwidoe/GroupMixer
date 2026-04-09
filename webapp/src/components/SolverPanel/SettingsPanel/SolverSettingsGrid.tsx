import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from '../../Tooltip';
import type { SolverSettings } from '../../../types';
import type { SolverUiSpec, SolverSettingFieldSpec } from '../../../services/solverUi';
import type { SolverFormInputs } from './types';

interface SolverSettingsGridProps {
  solverSettings: SolverSettings;
  solverUiSpec: SolverUiSpec | null;
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  handleSettingsChange: (newSettings: Partial<SolverSettings>) => void;
  isRunning: boolean;
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h4>
      {description && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      )}
    </div>
  );
}

export function SolverSettingsGrid({
  solverSettings,
  solverUiSpec,
  solverFormInputs,
  setSolverFormInputs,
  handleSettingsChange,
  isRunning,
}: SolverSettingsGridProps) {
  if (!solverUiSpec) {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border-secondary)', color: 'var(--text-secondary)' }}>
        No UI settings specification is available for <code>{solverSettings.solver_type}</code>.
      </div>
    );
  }

  const renderNumberField = (field: Extract<SolverSettingFieldSpec, { type: 'number' }>) => {
    const fallbackValue = field.getValue(solverSettings).toString() || field.defaultValue;
    const inputValue = solverFormInputs[field.inputKey] ?? fallbackValue;

    return (
      <div key={field.id}>
        <div className="flex items-center space-x-2 mb-1">
          <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {field.label}
          </label>
          <Tooltip content={field.description}>
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <input
          type="number"
          className="input"
          value={inputValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, [field.inputKey]: e.target.value }))
          }
          onBlur={() => {
            const rawValue = solverFormInputs[field.inputKey] ?? fallbackValue;
            const parsedValue = field.parse(rawValue);
            if (field.isValid(parsedValue)) {
              handleSettingsChange(field.applyValue(solverSettings, parsedValue));
              setSolverFormInputs((prev) => ({ ...prev, [field.inputKey]: undefined }));
            }
          }}
          disabled={isRunning}
          step={field.step}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
        />
      </div>
    );
  };

  const renderBooleanField = (field: Extract<SolverSettingFieldSpec, { type: 'boolean' }>) => (
    <div key={field.id}>
      <div className="flex items-center space-x-2 mb-1">
        <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {field.label}
        </label>
        <Tooltip content={field.description}>
          <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        </Tooltip>
      </div>
      <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <input
          type="checkbox"
          checked={field.getValue(solverSettings)}
          onChange={(e) => handleSettingsChange(field.applyValue(solverSettings, e.target.checked))}
          disabled={isRunning}
        />
        Enable
      </label>
    </div>
  );

  return (
    <div className="space-y-6">
      {solverUiSpec.settingsSections.map((section) => (
        <div key={section.id}>
          <SectionHeading title={section.title} description={section.description} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {section.fields.map((field) =>
              field.type === 'number' ? renderNumberField(field) : renderBooleanField(field)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
