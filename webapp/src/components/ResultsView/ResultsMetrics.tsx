import React from 'react';
import { AlertTriangle, PieChart, RefreshCw, Target, Users } from 'lucide-react';
import type { MetricCalculations } from '../../utils/metricCalculations';
import { getColorClass } from '../../utils/metricCalculations';
import type { SolverState, Solution } from '../../types';
import { MetricCard } from './MetricCard';

interface ResultsMetricsProps {
  solution: Solution;
  metrics: MetricCalculations | null;
  solverState: SolverState;
  finalConstraintPenalty: number;
  constraintColorClass: string;
}

export function ResultsMetrics({
  solution,
  metrics,
  solverState,
  finalConstraintPenalty,
  constraintColorClass,
}: ResultsMetricsProps) {
  const repetitionPenalty = solution.weighted_repetition_penalty ?? solution.repetition_penalty;
  const repetitionBaseline = (solverState.currentRepetitionPenalty ?? repetitionPenalty) || 1;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <MetricCard title="Cost Score" value={solution.final_score.toFixed(1)} icon={Target} colorClass="text-green-600" />
      {metrics && (
        <MetricCard
          title="Unique Contacts"
          value={`${solution.unique_contacts} / ${metrics.effectiveMaxUniqueTotal}`}
          icon={Users}
          colorClass={metrics.uniqueColorClass}
        />
      )}
      {metrics && (
        <MetricCard
          title="Avg Contacts / Person"
          value={`${metrics.avgUniqueContacts.toFixed(1)} / ${metrics.effectiveMaxAvgContacts}`}
          icon={PieChart}
          colorClass={metrics.avgColorClass}
        />
      )}
      <MetricCard
        title="Repetition Penalty"
        value={repetitionPenalty.toFixed(1)}
        icon={RefreshCw}
        colorClass={getColorClass(repetitionPenalty / repetitionBaseline, true)}
      />
      <MetricCard
        title="Constraint Penalty"
        value={finalConstraintPenalty.toFixed(1)}
        icon={AlertTriangle}
        colorClass={constraintColorClass}
      />
    </div>
  );
}
