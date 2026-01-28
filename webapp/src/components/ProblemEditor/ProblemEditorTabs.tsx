import React from 'react';
import { BarChart3, Calendar, Hash, Lock, Users, Zap } from 'lucide-react';
import type { Problem } from '../../types';

interface ProblemEditorTabsProps {
  activeSection: string;
  problem: Problem | null;
  objectiveCount: number;
  onNavigate: (sectionId: string) => void;
}

export function ProblemEditorTabs({ activeSection, problem, objectiveCount, onNavigate }: ProblemEditorTabsProps) {
  const tabs = [
    { id: 'people', label: 'People', icon: Users, count: (problem?.people ?? []).length },
    { id: 'groups', label: 'Groups', icon: Hash, count: (problem?.groups ?? []).length },
    { id: 'sessions', label: 'Sessions', icon: Calendar, count: problem?.num_sessions ?? 0 },
    { id: 'objectives', label: 'Objectives', icon: BarChart3, count: objectiveCount > 0 ? objectiveCount : undefined },
    { id: 'hard', label: 'Hard Constraints', icon: Lock, count: problem?.constraints ? problem.constraints.filter(c => ['ImmovablePeople', 'MustStayTogether'].includes(c.type as string)).length : 0 },
    { id: 'soft', label: 'Soft Constraints', icon: Zap, count: problem?.constraints ? problem.constraints.filter(c => ['RepeatEncounter', 'AttributeBalance', 'ShouldNotBeTogether', 'ShouldStayTogether', 'PairMeetingCount'].includes(c.type as string)).length : 0 },
  ];

  return (
    <div className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
      <nav className="flex flex-wrap justify-between gap-y-2">
        {tabs.map(tab => (
          <button
            className={`flex-1 flex flex-row items-center justify-center min-w-[140px] gap-1 px-3 py-1.5 rounded-md font-medium transition-colors ${activeSection === tab.id ? 'bg-[var(--bg-tertiary)] text-[var(--color-accent)]' : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--color-accent)]'}`}
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
          >
            <tab.icon className="w-5 h-5" />
            <span className="whitespace-nowrap">{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{tab.count}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
