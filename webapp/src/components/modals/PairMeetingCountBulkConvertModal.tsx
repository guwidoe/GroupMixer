import React, { useMemo, useState } from 'react';
import type { Person } from '../../types';

type Mode = 'at_least' | 'exact' | 'at_most';

interface Props {
  selectedCount: number;
  totalSessions: number;
  people: Person[];
  selectedConstraints: Array<{ index: number; people: string[] }>;
  onCancel: () => void;
  onConvert: (opts: {
    retainOriginal: boolean;
    sessions: number[]; // empty => all
    target: number;
    mode: Mode;
    useSourceWeight: boolean;
    overrideWeight?: number;
    anchorsByIndex?: Record<number, string>;
  }) => void;
}

const PairMeetingCountBulkConvertModal: React.FC<Props> = ({ selectedCount, totalSessions, people, selectedConstraints, onCancel, onConvert }) => {
  const [retainOriginal, setRetainOriginal] = useState(true);
  const [sessions, setSessions] = useState<number[]>([]);
  const [target, setTarget] = useState<number>(1);
  const [mode, setMode] = useState<Mode>('at_least');
  const [useSourceWeight, setUseSourceWeight] = useState(true);
  const [overrideWeight, setOverrideWeight] = useState<number>(100);
  const [error, setError] = useState<string>('');
  const [anchorsByIndex, setAnchorsByIndex] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const sc of selectedConstraints) {
      // default to first person for each constraint
      init[sc.index] = sc.people[0] || '';
    }
    return init;
  });

  const allSessions = useMemo(() => Array.from({ length: totalSessions }, (_, i) => i), [totalSessions]);

  const handleConvert = () => {
    setError('');
    const subset = sessions.length > 0 ? sessions : allSessions;
    if (target < 0 || target > subset.length) {
      setError(`Target must be between 0 and ${subset.length} for the selected sessions.`);
      return;
    }
    if (!useSourceWeight && (isNaN(overrideWeight) || overrideWeight <= 0)) {
      setError('Override weight must be a positive number.');
      return;
    }
    onConvert({ retainOriginal, sessions, target, mode, useSourceWeight, overrideWeight, anchorsByIndex });
  };

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-4 sm:p-6 w-full max-w-lg mx-auto modal-content max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Convert to Pair Meeting Count</h3>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          {selectedCount} selected Should Stay Together constraint(s) will be converted.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-md border" style={{ backgroundColor: 'var(--color-error-50)', borderColor: 'var(--color-error-200)', color: 'var(--color-error-700)' }}>
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Anchors are chosen per constraint below; default is the first person in each constraint. */}

          {/* Per-constraint anchors for groups with > 2 people */}
          {selectedConstraints.filter(sc => (sc.people?.length || 0) > 2).length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Anchors for constraints with 3+ people</div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {selectedConstraints.filter(sc => sc.people.length > 2).map(sc => (
                  <div key={sc.index} className="border rounded p-2" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Constraint #{sc.index}</div>
                    <div className="flex flex-wrap gap-2">
                      {sc.people.map(pid => {
                        const per = people.find(pp => pp.id === pid);
                        const label = per && typeof per.attributes?.name === 'string' && per.attributes.name ? per.attributes.name : pid;
                        const isAnchor = anchorsByIndex[sc.index] === pid;
                        return (
                          <button
                            key={pid}
                            className={`px-2 py-1 rounded text-xs border ${isAnchor ? 'text-white' : ''}`}
                            style={{
                              borderColor: 'var(--border-primary)',
                              backgroundColor: isAnchor ? 'var(--color-success-600, #16a34a)' : 'transparent',
                            }}
                            onClick={() => setAnchorsByIndex(prev => ({ ...prev, [sc.index]: pid }))}
                          >
                            <span title={pid}>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Click a person to set as anchor for this constraint.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Original constraints</div>
            <label className="mr-4 text-sm">
              <input type="radio" name="retain" checked={retainOriginal} onChange={() => setRetainOriginal(true)} /> Retain
            </label>
            <label className="text-sm">
              <input type="radio" name="retain" checked={!retainOriginal} onChange={() => setRetainOriginal(false)} /> Delete after conversion
            </label>
          </div>

          <div>
            <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Sessions for new constraints (optional)</div>
            <div className="flex flex-wrap gap-2">
              {allSessions.map((s) => {
                const selected = sessions.includes(s);
                return (
                  <button key={s} className={`px-2 py-1 rounded text-xs border ${selected ? 'bg-[var(--color-accent)] text-white' : ''}`} style={{ borderColor: 'var(--border-primary)' }} onClick={() => {
                    setSessions(prev => selected ? prev.filter(x => x !== s) : [...prev, s].sort((a, b) => a - b));
                  }}>
                    {s + 1}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Leave empty to apply to all sessions.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Target meetings</label>
              <input type="number" className="input w-full" min={0} value={target} onChange={(e) => setTarget(parseInt(e.target.value || '0', 10))} />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Mode</label>
              <select className="select w-full" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="at_least">At least</option>
                <option value="exact">Exact</option>
                <option value="at_most">At most</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Penalty weight</div>
            <label className="mr-4 text-sm">
              <input type="radio" name="weight" checked={useSourceWeight} onChange={() => setUseSourceWeight(true)} /> Use source weight
            </label>
            <label className="text-sm inline-flex items-center gap-2">
              <input type="radio" name="weight" checked={!useSourceWeight} onChange={() => setUseSourceWeight(false)} /> Override with
              <input type="number" className="input w-28" min={0} step={0.1} disabled={useSourceWeight} value={overrideWeight} onChange={(e) => setOverrideWeight(parseFloat(e.target.value || '0'))} />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button className="btn-secondary px-4 py-2" onClick={onCancel}>Cancel</button>
          <button className="btn-primary px-4 py-2" onClick={handleConvert}>Convert</button>
        </div>
      </div>
    </div>
  );
};

export default PairMeetingCountBulkConvertModal;


