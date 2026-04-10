import React, { useState } from 'react';
import type { Scenario } from '../types';
import { getConstraintDisplayName } from '../utils/constraintDisplay';

interface AttributeBalanceConstraint {
  type: 'AttributeBalance';
  group_id: string;
  attribute_key: string;
  desired_values: Record<string, number>;
  penalty_weight: number;
  sessions?: number[];
}

interface Props {
  constraints: AttributeBalanceConstraint[];
  scenario: Scenario;
}

const AttributeBalanceDashboard: React.FC<Props> = ({ constraints, scenario }) => {
  // === Session filter state ===
  const [sessionFilter, setSessionFilter] = useState<number>(0); // default to first session

  if (constraints.length === 0 || !scenario) return null;

  const filteredConstraints = constraints.filter(c => {
    // Include if constraint applies to current session
    return !c.sessions || c.sessions.includes(sessionFilter);
  });

  if (filteredConstraints.length === 0) return (
    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
      No {getConstraintDisplayName('AttributeBalance')} constraints for the selected session.
    </div>
  );

  // Build per-attribute metrics including weight-specific counts per value
  const metrics = filteredConstraints.reduce((acc, c) => {
    const key = c.attribute_key;
    if (!acc[key]) {
      acc[key] = {
        maxWeight: 1,
        valueWeightCounts: {} as Record<string, Record<number, number>>, // value -> weight -> count
      };
    }
    acc[key].maxWeight = Math.max(acc[key].maxWeight, c.penalty_weight || 1);

    Object.entries(c.desired_values).forEach(([val, cnt]) => {
      if (!acc[key].valueWeightCounts[val]) acc[key].valueWeightCounts[val] = {};
      const w = c.penalty_weight || 1;
      acc[key].valueWeightCounts[val][w] = (acc[key].valueWeightCounts[val][w] || 0) + cnt;
    });
    return acc;
  }, {} as Record<string, { maxWeight: number; valueWeightCounts: Record<string, Record<number, number>> }>);

  // Helper to interpolate color between red (min) and green (max)
  const weightToColor = (weight: number, max: number) => {
    const ratio = max > 1 ? (weight - 1) / (max - 1) : 1; // 0 -> red, 1 -> green
    const r = Math.round(255 * (1 - ratio));
    const g = Math.round(128 + (127 * ratio)); // start at dark red -> green
    const b = Math.round(0);
    return `rgb(${r},${g},${b})`;
  };

  // Available counts from people
  const available: Record<string, Record<string, number>> = {};
  scenario.people.forEach((p) => {
    Object.entries(p.attributes).forEach(([k, v]) => {
      if (!available[k]) available[k] = {};
      const val = String(v);
      available[k][val] = (available[k][val] || 0) + 1;
    });
  });

  return (
    <div className="rounded-md border p-4 space-y-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      {/* Session selector */}
      {scenario.num_sessions > 1 && (
        <div className="flex items-center gap-2 mb-2" onWheel={(e)=>{
              e.preventDefault();
              const dir = e.deltaY > 0 ? 1 : -1;
              setSessionFilter(prev => (prev + dir + scenario.num_sessions) % scenario.num_sessions);
            }}>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Session:</span>
          <select
            value={sessionFilter}
            onChange={(e)=>setSessionFilter(parseInt(e.target.value))}
            className="text-xs px-1 py-0.5 rounded border"
            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', borderColor: 'var(--border-secondary)' }}
          >
            {Array.from({length: scenario.num_sessions},(_,i)=>i).map(s=>(
              <option key={s} value={s}>{s+1}</option>
            ))}
          </select>
        </div>
      )}
      {Object.entries(metrics).map(([attr, data]) => {
        const availForAttr = available[attr] || {};
        const totalAllocated = Object.values(data.valueWeightCounts).reduce((sum, vw) => sum + Object.values(vw).reduce((a,b)=>a+b,0), 0);
        const totalAvailable = Object.values(availForAttr).reduce((a, b) => a + b, 0);

        return (
          <div key={attr} className="space-y-1">
            <h5 className="font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
              {attr}: {totalAllocated} / {totalAvailable || '0'} allocated
            </h5>

            {Object.entries(data.valueWeightCounts).map(([val, weightMap]) => {
              const avail = availForAttr[val] || 0;
              const totalForVal = Object.values(weightMap).reduce((a,b)=>a+b,0);
              const segments = Object.entries(weightMap).sort((a,b)=>Number(a[0])-Number(b[0]));
              return (
                <div key={val} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="capitalize w-20">{val}</span>
                  <span className="whitespace-nowrap">{totalForVal} / {avail}</span>
                  <div className="flex-1 h-2 rounded bg-gray-700 overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <div className="flex h-full w-full">
                      {segments.map(([wStr, count]) => {
                        const segPct = avail ? (count / avail) * 100 : 0;
                        return (
                          <div key={wStr} style={{ width: `${segPct}%`, backgroundColor: weightToColor(Number(wStr), data.maxWeight) }} />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Weight legend */}
            {(() => {
              const weightSet = new Set<string>();
              Object.values(data.valueWeightCounts).forEach(wm => Object.keys(wm).forEach(w=>weightSet.add(w)));
              const weights = Array.from(weightSet).sort((a,b)=>Number(a)-Number(b));
              return (
                <div className="flex flex-wrap gap-2 mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {weights.map(w => (
                    <span key={w} className="inline-flex items-center gap-1">
                      <span className="w-3 h-3 rounded" style={{ backgroundColor: weightToColor(Number(w), data.maxWeight) }}></span>
                      weight {w}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
};

export default AttributeBalanceDashboard; 