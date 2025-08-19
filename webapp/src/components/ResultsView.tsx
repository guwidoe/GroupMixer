import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { 
  BarChart3, 
  Users, 
  Target, 
  AlertTriangle, 
  Hash,
  Download,
  RefreshCw,
  PieChart,
  CheckCircle,
  XCircle,
  Info,
  ChevronDown,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import type { Problem, ProblemSnapshot, SolverSettings, Constraint, Person } from '../types';
import { Tooltip } from './Tooltip';
import PersonCard from './PersonCard';
import { compareProblemConfigurations } from '../services/problemStorage';
import { calculateMetrics, getColorClass } from '../utils/metricCalculations';

function snapshotToProblem(snapshot: ProblemSnapshot, settings: SolverSettings): Problem {
  // Use the settings that were saved with the result, not current settings
  return {
    ...snapshot,
    settings,
  };
}

export function ResultsView() {
  const { problem, solution, solverState, currentProblemId, savedProblems } = useAppStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [configDetailsOpen, setConfigDetailsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);





  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };

    if (exportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [exportDropdownOpen]);

  // Close config details when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.config-details-badge') && !target.closest('.relative')) {
        setConfigDetailsOpen(false);
      }
    };

    if (configDetailsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [configDetailsOpen]);

  // Find the current result object and derive the name
  const currentResult = useMemo(() => {
    if (!currentProblemId || !solution) return undefined;
    const problem = savedProblems[currentProblemId];
    if (!problem) return undefined;
    return problem.results.find(r => r.solution === solution);
  }, [currentProblemId, savedProblems, solution]);

  const resultName = currentResult?.name;

  // Use the problemSnapshot from the result if available, otherwise fall back to current problem
  const effectiveProblem = useMemo(() => {
    if (currentResult?.problemSnapshot) {
      return snapshotToProblem(currentResult.problemSnapshot, currentResult.solverSettings);
    }
    return problem;
  }, [currentResult, problem]);

  // Check if problem configuration has changed since result was created
  const configDiff = useMemo(() => {
    if (!problem || !currentResult?.problemSnapshot) return null;
    const currentProblemData = savedProblems[currentProblemId!];
    if (!currentProblemData) return null;
    const mostRecentResult = currentProblemData.results
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    // If this is the most recent result, only show warning if it differs from current problem
    if (currentResult.id === mostRecentResult?.id) {
      return compareProblemConfigurations(
        problem,
        snapshotToProblem(currentResult.problemSnapshot, currentResult.solverSettings)
      );
    }
    // For older results, compare with the most recent result's configuration
    if (mostRecentResult?.problemSnapshot) {
      return compareProblemConfigurations(
        snapshotToProblem(mostRecentResult.problemSnapshot, mostRecentResult.solverSettings),
        snapshotToProblem(currentResult.problemSnapshot, currentResult.solverSettings)
      );
    }
    // Fallback to comparing with current problem
    return compareProblemConfigurations(
      problem,
      snapshotToProblem(currentResult.problemSnapshot, currentResult.solverSettings)
    );
  }, [problem, currentResult, currentProblemId, savedProblems]);

  // === Derived Metrics using cached configuration ===
  const metrics = useMemo(() => {
    if (!solution) return null;
    
    // Use the result's problemSnapshot for metric calculations, fallback to current problem
    const problemConfig = currentResult?.problemSnapshot || problem;
    if (!problemConfig) return null;
    
    return calculateMetrics(problemConfig, solution);
  }, [solution, currentResult, problem]);

  // Constraint penalty normalization
  const finalConstraintPenalty = solution?.weighted_constraint_penalty ?? solution?.constraint_penalty ?? 0;
  const baselineConstraintPenalty = useMemo(() => {
    const base = solverState.initialConstraintPenalty ?? solverState.currentConstraintPenalty ?? finalConstraintPenalty;
    return base === 0 ? (finalConstraintPenalty > 0 ? finalConstraintPenalty : 1) : base;
  }, [solverState.initialConstraintPenalty, solverState.currentConstraintPenalty, finalConstraintPenalty]);

  const constraintRatio = Math.min(finalConstraintPenalty / baselineConstraintPenalty, 1);
  const constraintColorClass = getColorClass(constraintRatio, true);

  // === Constraint Compliance Evaluation ===
  type ConstraintCompliance = { constraint: Constraint; adheres: boolean; violations: number };

  const constraintResults: ConstraintCompliance[] = useMemo(() => {
    if (!solution) return [];

    // Use the result's problemSnapshot for constraint evaluation, fallback to current problem
    const problemConfig = currentResult?.problemSnapshot || problem;
    if (!problemConfig) return [];

    // Build schedule map: session -> group -> people array
    const schedule: Record<number, Record<string, string[]>> = {};
    solution.assignments.forEach(a => {
      if (!schedule[a.session_id]) schedule[a.session_id] = {};
      if (!schedule[a.session_id][a.group_id]) schedule[a.session_id][a.group_id] = [];
      schedule[a.session_id][a.group_id].push(a.person_id);
    });

    const personMap = new Map<string, Person>(problemConfig.people.map(p => [p.id, p]));

    const results: ConstraintCompliance[] = problemConfig.constraints.map((c): ConstraintCompliance => {
      switch (c.type) {
        case 'RepeatEncounter': {
          const pairCounts = new Map<string, number>();
          Object.values(schedule).forEach(groups => {
            Object.values(groups).forEach(peopleIds => {
              for (let i = 0; i < peopleIds.length; i++) {
                for (let j = i + 1; j < peopleIds.length; j++) {
                  const pairKey = [peopleIds[i], peopleIds[j]].sort().join('|');
                  pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
                }
              }
            });
          });
          let violations = 0;
          pairCounts.forEach(count => {
            if (count > c.max_allowed_encounters) {
              // Encounters exceed allowed total count
              violations += count - c.max_allowed_encounters;
            }
          });
          return { constraint: c, adheres: violations === 0, violations };
        }
        case 'ShouldStayTogether': {
          const sessions = c.sessions ?? Array.from({ length: problemConfig.num_sessions }, (_, i) => i);
          let violations = 0;
          sessions.forEach(session => {
            const groupIdSet = new Set<string>();
            c.people.forEach(pid => {
              let assignedGroup: string | undefined;
              const groups = schedule[session];
              if (groups) {
                for (const [gid, ids] of Object.entries(groups)) {
                  if (ids.includes(pid)) {
                    assignedGroup = gid;
                    break;
                  }
                }
              }
              if (assignedGroup) groupIdSet.add(assignedGroup);
              else violations += 1; // person not assigned in this session
            });
            if (groupIdSet.size > 1) violations += groupIdSet.size - 1;
          });
          return { constraint: c, adheres: violations === 0, violations };
        }
        case 'AttributeBalance': {
          let violations = 0;
          const sessionsToCheck = c.sessions ?? Array.from({ length: problemConfig.num_sessions }, (_, i) => i);
          sessionsToCheck.forEach(session => {
            const peopleIds = schedule[session]?.[c.group_id] || [];
            const counts: Record<string, number> = {};
            peopleIds.forEach(pid => {
              const person = personMap.get(pid);
              const val = person?.attributes?.[c.attribute_key] ?? '__UNKNOWN__';
              counts[val] = (counts[val] || 0) + 1;
            });
            Object.entries(c.desired_values).forEach(([val, desired]) => {
              if ((counts[val] || 0) !== desired) violations += Math.abs((counts[val] || 0) - desired);
            });
          });
          return { constraint: c, adheres: violations === 0, violations };
        }
        case 'ImmovablePeople': {
          let violations = 0;
          const sessions = c.sessions ?? Array.from({ length: problemConfig.num_sessions }, (_, i) => i);
          sessions.forEach(session => {
            const peopleIds = schedule[session]?.[c.group_id] || [];
            c.people.forEach(pid => {
              if (!peopleIds.includes(pid)) violations += 1;
            });
          });
          return { constraint: c, adheres: violations === 0, violations };
        }
        case 'MustStayTogether': {
          const sessions = c.sessions ?? Array.from({ length: problemConfig.num_sessions }, (_, i) => i);
          let violations = 0;
          sessions.forEach(session => {
            const groupIdSet = new Set<string>();
            c.people.forEach(pid => {
              let assignedGroup: string | undefined;
              const groups = schedule[session];
              if (groups) {
                for (const [gid, ids] of Object.entries(groups)) {
                  if (ids.includes(pid)) {
                    assignedGroup = gid;
                    break;
                  }
                }
              }
              if (assignedGroup) groupIdSet.add(assignedGroup);
              else violations += 1; // person not assigned
            });
            if (groupIdSet.size > 1) violations += groupIdSet.size - 1;
          });
          return { constraint: c, adheres: violations === 0, violations };
        }
        case 'ShouldNotBeTogether': {
          const sessions = c.sessions ?? Array.from({ length: problemConfig.num_sessions }, (_, i) => i);
          let violations = 0;
          sessions.forEach(session => {
            const groups = schedule[session] || {};
            Object.values(groups).forEach(ids => {
              const overlap = ids.filter(id => c.people.includes(id));
              if (overlap.length > 1) violations += overlap.length - 1;
            });
          });
          return { constraint: c, adheres: violations === 0, violations };
        }
        default:
          return { constraint: c as Constraint, adheres: true, violations: 0 };
      }
    });

    return results;
  }, [problem, solution, currentResult]);

  if (!solution) {
    return (
      <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-secondary)' }}>
        <Target className="w-16 h-16 mb-4" style={{ color: 'var(--text-tertiary)' }} />
        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>No Results Yet</h3>
        <p className="text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
          Run the solver or select one of the results from the Results tab to see optimization results and group assignments.
        </p>
      </div>
    );
  }

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateCSV = () => {
    if (!effectiveProblem || !solution) return '';
    
    const headers = [
      'Person ID',
      'Group ID', 
      'Session',
      'Person Name',
      'Person Attributes'
    ];

    const rows = solution.assignments.map(assignment => {
      const person = effectiveProblem.people.find(p => p.id === assignment.person_id);
      const personName = person?.attributes.name || assignment.person_id;
      const personAttrs = person ? Object.entries(person.attributes)
        .filter(([key]) => key !== 'name')
        .map(([key, value]) => `${key}:${value}`)
        .join('; ') : '';

      return [
        assignment.person_id,
        assignment.group_id,
        assignment.session_id + 1, // Convert to 1-based for user display
        personName,
        personAttrs
      ];
    });

    // Add metadata at the top
    const metadata = [
      ['Result Name', resultName || 'Current Result'],
      ['Export Date', new Date().toISOString()],
      ['Final Score', solution.final_score.toFixed(2)],
      ['Unique Contacts', solution.unique_contacts.toString()],
      ['Iterations', solution.iteration_count.toLocaleString()],
      ['Repetition Penalty', (solution.weighted_repetition_penalty ?? solution.repetition_penalty).toFixed(2)],
      ['Balance Penalty', solution.attribute_balance_penalty.toFixed(2)],
      ['Constraint Penalty', (solution.weighted_constraint_penalty ?? solution.constraint_penalty).toFixed(2)],
      [], // Empty row
      headers
    ];

    const allRows = [...metadata, ...rows];
    
    return allRows.map(row => 
      row.map(cell => 
        typeof cell === 'string' && (cell.includes(',') || cell.includes('"')) 
          ? `"${cell.replace(/"/g, '""')}"` 
          : cell
      ).join(',')
    ).join('\n');
  };

  const handleExportResult = (format: 'json' | 'csv' | 'excel') => {
    if (!effectiveProblem || !solution) return;
    
    const fileName = (resultName || 'result').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    if (format === 'json') {
      const exportData = {
        problem: effectiveProblem,
        solution,
        exportedAt: Date.now(),
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      downloadFile(blob, `${fileName}.json`);
    } else if (format === 'csv') {
      const csvData = generateCSV();
      const blob = new Blob([csvData], { type: 'text/csv' });
      downloadFile(blob, `${fileName}.csv`);
    } else if (format === 'excel') {
      const csvData = generateCSV();
      const blob = new Blob([csvData], { type: 'application/vnd.ms-excel' });
      downloadFile(blob, `${fileName}.xls`);
    }
    
    setExportDropdownOpen(false);
  };

  // Group assignments by session for display
  const sessionData = useMemo(() => {
    if (!solution || !effectiveProblem) {
      return [];
    }
    
    return Array.from({ length: effectiveProblem.num_sessions || 0 }, (_, sessionIndex) => {
      const sessionAssignments = solution.assignments.filter(a => a.session_id === sessionIndex);
      
      const groups = effectiveProblem.groups.map(group => {
        const groupAssignments = sessionAssignments.filter(a => a.group_id === group.id);
        const people = groupAssignments
          .map(a => effectiveProblem.people.find(p => p.id === a.person_id))
          .filter(Boolean);
        
        return {
          ...group,
          people
        };
      }) || [];
      
      return {
        sessionIndex,
        groups,
        totalPeople: sessionAssignments.length
      };
    });
  }, [solution, effectiveProblem]);

  const getPersonById = (id: string) => effectiveProblem?.people.find(p => p.id === id);

  const formatConstraintLabel = (constraint: Constraint): React.ReactNode => {
    switch (constraint.type) {
      case 'RepeatEncounter':
        return `Repeat Encounter (max ${constraint.max_allowed_encounters})`;
      case 'AttributeBalance':
        return (
          <>
            Attribute Balance – <span className="font-medium">{constraint.group_id}</span> ({constraint.attribute_key})
          </>
        );
      case 'ImmovablePeople': {
        return (
          <>
            Immovable – (
            {constraint.people.map((pid: string, idx: number) => {
              const person = getPersonById(pid);
              return (
                <React.Fragment key={pid}>
                  {idx > 0 && ''}
                  {person ? <PersonCard person={person} /> : pid}
                </React.Fragment>
              );
            })}
            ) in <span className="font-medium">{constraint.group_id}</span>
          </>
        );
      }
      case 'MustStayTogether': {
        return (
          <>
            Must Stay Together (
            {constraint.people.map((pid: string, idx: number) => {
              const person = getPersonById(pid);
              return (
                <React.Fragment key={pid}>
                  {idx > 0 && ''}
                  {person ? <PersonCard person={person} /> : pid}
                </React.Fragment>
              );
            })}
            )
          </>
        );
      }
      case 'ShouldNotBeTogether': {
        return (
          <>
            Should Not Be Together (
            {constraint.people.map((pid: string, idx: number) => {
              const person = getPersonById(pid);
              return (
                <React.Fragment key={pid}>
                  {idx > 0 && ''}
                  {person ? <PersonCard person={person} /> : pid}
                </React.Fragment>
              );
            })}
            )
          </>
        );
      }
      case 'ShouldStayTogether': {
        return (
          <>
            Should Stay Together (
            {constraint.people.map((pid: string, idx: number) => {
              const person = getPersonById(pid);
              return (
                <React.Fragment key={pid}>
                  {idx > 0 && ''}
                  {person ? <PersonCard person={person} /> : pid}
                </React.Fragment>
              );
            })}
            )
          </>
        );
      }
      default:
        return 'Unknown Constraint';
    }
  };

  const renderMetricCard = (title: string, value: string | number, icon: React.ComponentType<{ className?: string }>, color: string) => (
    <div className="rounded-lg border p-6 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
        {React.createElement(icon, { className: `w-8 h-8 ${color.replace('text-', 'text-').replace('-600', '-400')}` })}
      </div>
    </div>
  );

  const renderPersonBadge = (person: Person) => {
    if (!person) return null;
    return <PersonCard key={person.id} person={person} />;
  };

  const renderScheduleGrid = () => (
    <div className="space-y-6">
      {sessionData.map(({ sessionIndex, groups, totalPeople }) => (
        <div key={sessionIndex} className="rounded-lg border p-6 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              Session {sessionIndex + 1}
            </h4>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {totalPeople} people assigned
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map(group => (
              <div key={group.id} className="border rounded-lg p-4" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-medium" style={{ color: 'var(--text-primary)' }}>{group.id}</h5>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {group.people.length}/{group.size}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.people.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {group.people.filter((person): person is Person => person !== undefined).map(renderPersonBadge)}
                    </div>
                  ) : (
                    <p className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>No assignments</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderScheduleList = () => (
    <div className="rounded-lg border overflow-hidden transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
          <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Person
              </th>
              {Array.from({ length: effectiveProblem?.num_sessions || 0 }, (_, i) => (
                <th key={i} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Session {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}>
                          {effectiveProblem?.people.map((person, _index) => {
                const personAssignments = solution.assignments.filter(a => a.person_id === person.id);
                const displayName = person.attributes?.name || person.id;
              
              return (
                <tr key={person.id} className="transition-colors" style={{ backgroundColor: 'var(--bg-primary)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Users className="w-4 h-4 mr-2" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{displayName}</span>
                    </div>
                  </td>
                  {Array.from({ length: effectiveProblem?.num_sessions || 0 }, (_, sessionIndex) => {
                    const assignment = personAssignments.find(a => a.session_id === sessionIndex);
                    return (
                      <td key={sessionIndex} className="px-6 py-4 whitespace-nowrap">
                        {assignment ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}>
                            {assignment.group_id}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Not assigned</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (!solution || !effectiveProblem) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No Results Available</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Run the solver to generate results for this problem.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-0">
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
            <h2 className="text-2xl font-bold flex items-center gap-2 min-w-0" style={{ color: 'var(--text-primary)' }}>
              <span className="truncate">Optimization Results{resultName ? ` - ${resultName}` : ''}</span>
            </h2>
            {configDiff && configDiff.isDifferent && (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setConfigDetailsOpen(!configDetailsOpen)}
                  className="config-details-badge inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: '#dc2626',
                    color: '#dc2626'
                  }}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Different Config
                  <ChevronDown className={`h-3 w-3 transition-transform ${configDetailsOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {configDetailsOpen && (
                  <div className="absolute top-full left-0 mt-1 z-10 p-3 rounded-lg border shadow-lg"
                       style={{ 
                         backgroundColor: 'var(--bg-primary)', 
                         borderColor: '#dc2626',
                         color: 'var(--text-primary)',
                         minWidth: '320px',
                         width: '100%',
                         maxWidth: '90vw'
                       }}>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <span className="font-medium text-red-600">Different Problem Configuration</span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        This result was created with a different problem setup than the most recent result and may not be directly comparable with the current configuration.
                      </p>
                      <div className="mt-2 space-y-1">
                        {Object.entries(configDiff.details).map(([key, detail]) => (
                          detail && (
                            <div key={key} className="flex items-start space-x-2 text-xs">
                              <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 flex-shrink-0"></div>
                              <span style={{ color: 'var(--text-secondary)' }}>{detail}</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">Cost Score:</span>
              <span className="sm:hidden">Score:</span>
              {solution.final_score.toFixed(2)}
              <Tooltip content={<span>Cost Score = Unique contacts minus penalties. <b>Lower is better.</b></span>}>
                <Info className="w-4 h-4" />
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              {solution.iteration_count.toLocaleString()} iterations • 
              {(solution.elapsed_time_ms / 1000).toFixed(2)}s <span className="ml-1 italic hidden sm:inline">(lower cost is better)</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              className="btn-secondary flex items-center gap-2 justify-center sm:justify-start"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            
            {exportDropdownOpen && (
              <div className="absolute left-0 mt-1 min-w-full w-40 rounded-md shadow-lg z-10 border overflow-hidden" 
                   style={{ 
                     backgroundColor: 'var(--bg-primary)', 
                     borderColor: 'var(--border-primary)' 
                   }}>
                <button
                  onClick={() => handleExportResult('json')}
                  className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                  style={{ 
                    color: 'var(--text-primary)',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span>Export as JSON</span>
                </button>
                <button
                  onClick={() => handleExportResult('csv')}
                  className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                  style={{ 
                    color: 'var(--text-primary)',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span>Export as CSV</span>
                </button>
                <button
                  onClick={() => handleExportResult('excel')}
                  className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                  style={{ 
                    color: 'var(--text-primary)',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span>Export as Excel</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {renderMetricCard("Cost Score", solution.final_score.toFixed(1), Target, 'text-green-600')}
        {metrics && renderMetricCard("Unique Contacts", `${solution.unique_contacts} / ${metrics.effectiveMaxUniqueTotal}`, Users, metrics.uniqueColorClass)}
        {metrics && renderMetricCard("Avg Contacts / Person", `${metrics.avgUniqueContacts.toFixed(1)} / ${metrics.effectiveMaxAvgContacts}`, PieChart, metrics.avgColorClass)}
        {renderMetricCard("Repetition Penalty", (solution.weighted_repetition_penalty ?? solution.repetition_penalty).toFixed(1), RefreshCw, getColorClass((solution.weighted_repetition_penalty ?? solution.repetition_penalty) / ((solverState.currentRepetitionPenalty ?? (solution.weighted_repetition_penalty ?? solution.repetition_penalty)) || 1), true))}
        {renderMetricCard("Constraint Penalty", finalConstraintPenalty.toFixed(1), AlertTriangle, constraintColorClass)}
      </div>

      {/* Constraint Compliance */}
      <div className="rounded-lg border p-6 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Constraint Compliance</h3>
        <div className="space-y-2">
          {constraintResults.length > 0 ? constraintResults.map((res, idx) => (
            <div key={idx} className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {res.adheres ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                {formatConstraintLabel(res.constraint)}
              </div>
              {!res.adheres && (
                <span className="text-sm font-medium text-red-600">{res.violations} violation{res.violations !== 1 ? 's' : ''}</span>
              )}
            </div>
          )) : (
            <p className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>No constraints defined for this problem.</p>
          )}
        </div>
      </div>

      {/* Schedule View */}
      <div className="rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="border-b px-6 py-4" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
            <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Group Assignments</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className="px-3 py-1 rounded text-sm transition-colors"
                style={{
                  backgroundColor: viewMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--color-accent)' : 'var(--text-secondary)',
                  border: viewMode === 'grid' ? '1px solid var(--color-accent)' : '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  if (viewMode !== 'grid') {
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== 'grid') {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <Hash className="w-4 h-4 inline mr-1" />
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className="px-3 py-1 rounded text-sm transition-colors"
                style={{
                  backgroundColor: viewMode === 'list' ? 'var(--bg-tertiary)' : 'transparent',
                  color: viewMode === 'list' ? 'var(--color-accent)' : 'var(--text-secondary)',
                  border: viewMode === 'list' ? '1px solid var(--color-accent)' : '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  if (viewMode !== 'list') {
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== 'list') {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <BarChart3 className="w-4 h-4 inline mr-1" />
                List
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {viewMode === 'grid' ? renderScheduleGrid() : renderScheduleList()}
        </div>
      </div>
    </div>
  );
} 