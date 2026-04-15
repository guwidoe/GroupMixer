import { X, Zap } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';
import type { GeneratedDemoScenarioOptions } from '../../services/demoScenarioGenerator';

interface GeneratedDemoDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (options: GeneratedDemoScenarioOptions) => void;
}

const DEFAULT_GROUP_COUNT = '6';
const DEFAULT_PEOPLE_PER_GROUP = '4';
const DEFAULT_SESSION_COUNT = '4';

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

export function GeneratedDemoDataModal({ isOpen, onClose, onGenerate }: GeneratedDemoDataModalProps) {
  const [groupCountInput, setGroupCountInput] = useState(DEFAULT_GROUP_COUNT);
  const [peoplePerGroupInput, setPeoplePerGroupInput] = useState(DEFAULT_PEOPLE_PER_GROUP);
  const [sessionCountInput, setSessionCountInput] = useState(DEFAULT_SESSION_COUNT);

  const preview = useMemo(() => {
    const groupCount = parsePositiveInteger(groupCountInput, 1);
    const peoplePerGroup = parsePositiveInteger(peoplePerGroupInput, 1);
    const sessionCount = parsePositiveInteger(sessionCountInput, 1);

    return {
      groupCount,
      peoplePerGroup,
      sessionCount,
      totalPeople: groupCount * peoplePerGroup,
    };
  }, [groupCountInput, peoplePerGroupInput, sessionCountInput]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 modal-backdrop z-[70] overflow-y-auto p-4">
      <div className="flex min-h-full items-center justify-center py-6">
        <div className="modal-content mx-auto w-full max-w-lg rounded-xl p-6">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <Zap className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Generate random workshop demo
              </h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Choose the workshop shape. We will generate random people and group names, then add a single repeat-pairing constraint with weight 10 and a squared penalty.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex-shrink-0 rounded-md p-1 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-tertiary)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              aria-label="Close random demo generator"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              onGenerate({
                groupCount: preview.groupCount,
                peoplePerGroup: preview.peoplePerGroup,
                sessionCount: preview.sessionCount,
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                <span>Groups (g)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={groupCountInput}
                  onChange={(event) => setGroupCountInput(event.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>

              <label className="space-y-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                <span>People per group (p)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={peoplePerGroupInput}
                  onChange={(event) => setPeoplePerGroupInput(event.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>

              <label className="space-y-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                <span>Sessions (w)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={sessionCountInput}
                  onChange={(event) => setSessionCountInput(event.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
            </div>

            <div
              className="rounded-lg border p-4"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
            >
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Scenario preview
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {preview.totalPeople} people across {preview.groupCount} groups of {preview.peoplePerGroup}, scheduled over {preview.sessionCount} sessions.
              </p>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Generated scenarios include only one additional constraint: repeat pairing, max allowed encounters 1, penalty 10, squared.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="btn-secondary rounded-md px-4 py-2 font-medium transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md px-4 py-2 font-medium text-white transition-opacity"
                style={{ backgroundColor: 'var(--color-accent)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Generate scenario
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
