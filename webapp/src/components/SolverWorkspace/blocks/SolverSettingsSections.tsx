import React from 'react';
import { Info } from 'lucide-react';
import type { SolverSettings } from '../../../types';
import type { SolverSettingFieldSpec, SolverUiSpec } from '../../../services/solverUi';
import type { SolverFormInputs } from '../../SolverPanel/SettingsPanel/types';
import { Tooltip } from '../../Tooltip';

interface SolverSettingsSectionsProps {
  solverSettings: SolverSettings;
  solverUiSpec: SolverUiSpec | null;
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  handleSettingsChange: (newSettings: Partial<SolverSettings>) => void;
  isRunning: boolean;
}

function renderSectionHeading(title: string, description?: string) {
  return (
    <div className="mb-3">
      <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h4>
      {description ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function SolverSettingsSections({
  solverSettings,
  solverUiSpec,
  solverFormInputs,
  setSolverFormInputs,
  handleSettingsChange,
  isRunning,
}: SolverSettingsSectionsProps) {
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
        <div className="mb-1 flex items-center space-x-2">
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
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, [field.inputKey]: event.target.value }))
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
      <div className="mb-1 flex items-center space-x-2">
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
          onChange={(event) => handleSettingsChange(field.applyValue(solverSettings, event.target.checked))}
          disabled={isRunning}
        />
        Enable
      </label>
    </div>
  );

  return (
    <section
      className="rounded-2xl border p-4 md:p-5"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Manual Settings
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Tune universal, shared, and solver-specific parameters directly.
        </p>
      </div>

      <div className="space-y-6">
        {solverUiSpec.settingsSections.map((section) => (
          <div key={section.id}>
            {renderSectionHeading(section.title, section.description)}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.fields.map((field) => (field.type === 'number' ? renderNumberField(field) : renderBooleanField(field)))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
