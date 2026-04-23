import { X, Zap } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';
import type { GeneratedDemoScenarioOptions } from '../../services/demoScenarioGenerator';
import { NumberField, NUMBER_FIELD_PRESETS } from '../ui';

interface GeneratedDemoDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (options: GeneratedDemoScenarioOptions) => void;
}

const DEFAULT_GROUP_COUNT = 6;
const DEFAULT_PEOPLE_PER_GROUP = 4;
const DEFAULT_SESSION_COUNT = 4;

export function GeneratedDemoDataModal({ isOpen, onClose, onGenerate }: GeneratedDemoDataModalProps) {
  const [groupCount, setGroupCount] = useState<number | null>(DEFAULT_GROUP_COUNT);
  const [peoplePerGroup, setPeoplePerGroup] = useState<number | null>(DEFAULT_PEOPLE_PER_GROUP);
  const [sessionCount, setSessionCount] = useState<number | null>(DEFAULT_SESSION_COUNT);

  const preview = useMemo(() => {
    const safeGroupCount = Math.max(1, Math.round(groupCount ?? 1));
    const safePeoplePerGroup = Math.max(1, Math.round(peoplePerGroup ?? 1));
    const safeSessionCount = Math.max(1, Math.round(sessionCount ?? 1));

    return {
      groupCount: safeGroupCount,
      peoplePerGroup: safePeoplePerGroup,
      sessionCount: safeSessionCount,
      totalPeople: safeGroupCount * safePeoplePerGroup,
    };
  }, [groupCount, peoplePerGroup, sessionCount]);

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
              <NumberField label="Groups (g)" value={groupCount} onChange={setGroupCount} {...NUMBER_FIELD_PRESETS.groupCount} />

              <NumberField label="People per group (p)" value={peoplePerGroup} onChange={setPeoplePerGroup} {...NUMBER_FIELD_PRESETS.groupSize} />

              <NumberField label="Sessions (w)" value={sessionCount} onChange={setSessionCount} {...NUMBER_FIELD_PRESETS.sessionCount} />
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
