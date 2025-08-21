import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Constraint, Person } from '../../types';

interface Props {
  people: Person[];
  totalSessions: number;
  initial?: Constraint | null;
  onCancel: () => void;
  onSave: (constraint: Constraint) => void;
}

const PairMeetingCountModal: React.FC<Props> = ({ people, totalSessions, initial, onCancel, onSave }) => {
  const editing = !!initial && initial.type === 'PairMeetingCount';
  const initialState = useMemo(() => {
    if (editing) {
      const c = initial as Extract<Constraint, { type: 'PairMeetingCount' }>;
      return {
        a: c.people[0],
        b: c.people[1],
        target: c.target_meetings,
        sessions: c.sessions || [],
        mode: c.mode || 'at_least',
        weight: c.penalty_weight,
      };
    }
    return {
      a: people[0]?.id || '',
      b: people[1]?.id || '',
      target: 1,
      sessions: [] as number[],
      mode: 'at_least' as 'at_least' | 'exact' | 'at_most',
      weight: 100,
    };
  }, [editing, initial, people]);

  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string>('');

  const allSessions = useMemo(() => Array.from({ length: totalSessions }, (_, i) => i), [totalSessions]);

  const handleSave = () => {
    setError('');
    if (!form.a || !form.b || form.a === form.b) {
      setError('Please select two distinct people.');
      return;
    }
    const subset = form.sessions.length > 0 ? form.sessions : allSessions;
    if (form.target < 0 || form.target > subset.length) {
      setError(`Target must be between 0 and ${subset.length} for the selected sessions.`);
      return;
    }
    if (form.weight <= 0) {
      setError('Penalty weight must be positive.');
      return;
    }
    const constraint: Constraint = {
      type: 'PairMeetingCount',
      people: [form.a, form.b],
      sessions: form.sessions,
      target_meetings: form.target,
      mode: form.mode,
      penalty_weight: form.weight,
    } as unknown as Constraint;
    onSave(constraint);
  };

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto modal-content max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{editing ? 'Edit Pair Meeting Count' : 'Add Pair Meeting Count'}</h3>
          <button onClick={onCancel} className="transition-colors p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md border" style={{ backgroundColor: 'var(--color-error-50)', borderColor: 'var(--color-error-200)', color: 'var(--color-error-700)' }}>
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Person A</label>
              <select className="select w-full" value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Person B</label>
              <select className="select w-full" value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.id}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Sessions (optional)</label>
            <div className="flex flex-wrap gap-2">
              {allSessions.map((s) => {
                const selected = form.sessions.includes(s);
                return (
                  <button key={s} className={`px-2 py-1 rounded text-xs border ${selected ? 'bg-[var(--color-accent)] text-white' : ''}`} style={{ borderColor: 'var(--border-primary)' }} onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      sessions: selected ? prev.sessions.filter((x) => x !== s) : [...prev.sessions, s].sort((a, b) => a - b),
                    }));
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
              <input type="number" className="input w-full" min={0} value={form.target} onChange={(e) => setForm({ ...form, target: parseInt(e.target.value || '0', 10) })} />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Mode</label>
              <select className="select w-full" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as any })}>
                <option value="at_least">At least</option>
                <option value="exact">Exact</option>
                <option value="at_most">At most</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Penalty weight</label>
            <input type="number" className="input w-full" min={0} step={0.1} value={form.weight} onChange={(e) => setForm({ ...form, weight: parseFloat(e.target.value || '0') })} />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="btn-secondary px-5 py-2">Cancel</button>
          <button onClick={handleSave} className="btn-primary px-5 py-2">Save</button>
        </div>
      </div>
    </div>
  );
};

export default PairMeetingCountModal;


