import { useAppStore } from '../store';
import { 
  X, 
  BarChart3, 
  Clock, 
  Zap, 
  Target, 
  Users, 
  TrendingDown,
  Minus,
  Award,
  Settings
} from 'lucide-react';
import type { ScenarioResult } from '../types';

export function ResultComparison() {
  const {
    currentScenarioId,
    savedScenarios,
    selectedResultIds,
    setShowResultComparison,
    selectResultsForComparison,
  } = useAppStore();

  const currentScenario = currentScenarioId ? savedScenarios[currentScenarioId] : null;
  const results = currentScenario?.results || [];
  const selectedResults = results.filter(result => selectedResultIds.includes(result.id));

  const handleClose = () => {
    setShowResultComparison(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getScoreColor = (score: number) => {
    if (score <= -50000) return 'text-red-600';
    if (score <= -10000) return 'text-orange-600';
    if (score <= -1000) return 'text-yellow-600';
    if (score <= 0) return 'text-green-600';
    return 'text-gray-600';
  };

  function getColorClass(ratio: number, invert: boolean = false): string {
    let r = Math.max(0, Math.min(1, ratio));
    if (invert) r = 1 - r;
    if (r >= 0.9) return 'text-green-600';
    if (r >= 0.75) return 'text-lime-600';
    if (r >= 0.5) return 'text-yellow-600';
    if (r >= 0.25) return 'text-orange-600';
    return 'text-red-600';
  }

  const getBestResult = () => {
    if (selectedResults.length === 0) return null;
    return selectedResults.reduce((best, current) => 
      current.solution.final_score < best.solution.final_score ? current : best
    );
  };

  const getWorstResult = () => {
    if (selectedResults.length === 0) return null;
    return selectedResults.reduce((worst, current) => 
      current.solution.final_score > worst.solution.final_score ? current : worst
    );
  };

  const getComparisonIcon = (current: ScenarioResult, best: ScenarioResult, worst: ScenarioResult) => {
    if (current.id === best.id) return <Award className="w-4 h-4 text-green-500" />;
    if (current.id === worst.id) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return 'N/A';
    if (num < 0.001 && num !== 0) {
      return num.toExponential(2);
    }
    return num.toLocaleString(undefined, { 
      maximumFractionDigits: 6,
      minimumFractionDigits: 0
    });
  };

  const formatLargeNumber = (num: number | undefined) => {
    if (num === undefined) return 'N/A';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  };

  const bestResult = getBestResult();
  const worstResult = getWorstResult();

  if (selectedResults.length === 0) {
    return (
      <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
        <div className="card max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              No Results Selected
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>
            Please select at least 2 results to compare.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="modal-content rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-6 border-b gap-4 sm:gap-0" style={{ borderColor: 'var(--border-primary)' }}>
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Result Comparison
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Comparing {selectedResults.length} results from "{currentScenario?.name}"
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 p-2 self-end sm:self-auto"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-auto max-h-[calc(90vh-120px)]">
          <div className="p-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              <div className="card p-4">
                <div className="flex items-center mb-2">
                  <Award className="w-5 h-5 text-green-500 mr-2" />
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Best Result</h3>
                </div>
                {bestResult && (
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{bestResult.name}</p>
                    <p className="text-lg font-bold text-green-600">
                      {bestResult.solution.final_score.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              <div className="card p-4">
                <div className="flex items-center mb-2">
                  <TrendingDown className="w-5 h-5 text-red-500 mr-2" />
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Worst Result</h3>
                </div>
                {worstResult && (
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{worstResult.name}</p>
                    <p className="text-lg font-bold text-red-600">
                      {worstResult.solution.final_score.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              <div className="card p-4">
                <div className="flex items-center mb-2">
                  <BarChart3 className="w-5 h-5 text-blue-500 mr-2" />
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Score Range</h3>
                </div>
                {bestResult && worstResult && (
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Difference</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {(worstResult.solution.final_score - bestResult.solution.final_score).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Comparison Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
                    <th className="text-left p-4 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Metric
                    </th>
                    {selectedResults.map((result) => (
                      <th key={result.id} className="text-left p-4 min-w-[200px]">
                        <div className="flex items-center space-x-2">
                          {bestResult && worstResult && getComparisonIcon(result, bestResult, worstResult)}
                          <div>
                            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {result.name}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {formatDate(result.timestamp)}
                            </p>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Final Score */}
                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="w-4 h-4" />
                        <span>Final Score</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => (
                      <td key={result.id} className="p-4">
                        <span className={`font-bold text-lg ${getScoreColor(result.solution.final_score)}`}>
                          {result.solution.final_score.toFixed(2)}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Unique Contacts */}
                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Users className="w-4 h-4" />
                        <span>Unique Contacts</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => (
                      <td key={result.id} className="p-4">
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {result.solution.unique_contacts}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Duration */}
                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4" />
                        <span>Duration</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => (
                      <td key={result.id} className="p-4">
                        <span style={{ color: 'var(--text-primary)' }}>
                          {formatDuration(result.duration)}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Iterations */}
                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Zap className="w-4 h-4" />
                        <span>Iterations</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => (
                      <td key={result.id} className="p-4">
                        <span style={{ color: 'var(--text-primary)' }}>
                          {result.solution.iteration_count.toLocaleString()}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Repetition Penalty */}
                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Target className="w-4 h-4" />
                        <span>Repetition Penalty</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => {
                      const repPenalty = result.solution.weighted_repetition_penalty ?? result.solution.repetition_penalty;
                      const repColorClass = getColorClass(repPenalty === 0 ? 0 : 1, true);
                      return (
                        <td key={result.id} className="p-4">
                          <span className={`font-semibold ${repColorClass}`}>{repPenalty.toFixed(2)}</span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Attribute Balance Penalty */}
                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Settings className="w-4 h-4" />
                        <span>Balance Penalty</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => {
                      const balPenalty = result.solution.attribute_balance_penalty;
                      const balColorClass = getColorClass(balPenalty === 0 ? 0 : 1, true);
                      return (
                        <td key={result.id} className="p-4">
                          <span className={`font-semibold ${balColorClass}`}>{balPenalty.toFixed(2)}</span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Constraint Penalty */}
                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Settings className="w-4 h-4" />
                        <span>Constraint Penalty</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => {
                      const conPenalty = result.solution.weighted_constraint_penalty ?? result.solution.constraint_penalty;
                      const conColorClass = getColorClass(conPenalty === 0 ? 0 : 1, true);
                      return (
                        <td key={result.id} className="p-4">
                          <span className={`font-semibold ${conColorClass}`}>{conPenalty.toFixed(2)}</span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Solver Settings */}
                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Settings className="w-4 h-4" />
                        <span>Max Iterations</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => (
                      <td key={result.id} className="p-4">
                        <span style={{ color: 'var(--text-primary)' }}>
                          {formatLargeNumber(result.solverSettings.stop_conditions.max_iterations)}
                        </span>
                      </td>
                    ))}
                  </tr>

                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4" />
                        <span>Time Limit</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => (
                      <td key={result.id} className="p-4">
                        <span style={{ color: 'var(--text-primary)' }}>
                          {result.solverSettings.stop_conditions.time_limit_seconds || 'N/A'}s
                        </span>
                      </td>
                    ))}
                  </tr>

                  <tr className="border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Settings className="w-4 h-4" />
                        <span>Initial Temperature</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => (
                      <td key={result.id} className="p-4">
                        <span style={{ color: 'var(--text-primary)' }}>
                          {formatNumber(result.solverSettings.solver_params.SimulatedAnnealing?.initial_temperature)}
                        </span>
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-2">
                        <Settings className="w-4 h-4" />
                        <span>Reheat After</span>
                      </div>
                    </td>
                    {selectedResults.map((result) => (
                      <td key={result.id} className="p-4">
                        <span style={{ color: 'var(--text-primary)' }}>
                          {(result.solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0) === 0 
                            ? 'Disabled' 
                            : formatLargeNumber(result.solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0)
                          }
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-6 border-t gap-4 sm:gap-0" style={{ borderColor: 'var(--border-primary)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Lower scores are better (penalty-based scoring). The solver minimizes total penalties.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:space-x-3">
            <button
              onClick={() => selectResultsForComparison([])}
              className="btn-secondary"
            >
              Clear Selection
            </button>
            <button
              onClick={handleClose}
              className="btn-primary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 