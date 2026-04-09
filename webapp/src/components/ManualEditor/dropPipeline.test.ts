import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMoveBaseline,
  buildMoveReportData,
  findAssignedGroup,
  stagePersonMove,
} from './dropPipeline';
import { createSampleScenario, createSampleSolution } from '../../test/fixtures';
import { groupBySessionAndGroup } from './utils';
import { setRuntimeForTests, type SolverRuntime } from '../../services/runtime';
import { evaluateCompliance } from '../../services/evaluator';

function createRuntimeMock(overrides: Partial<SolverRuntime> = {}): SolverRuntime {
  return {
    initialize: vi.fn(async () => undefined),
    getCapabilities: vi.fn(async () => ({
      runtimeId: 'test',
      executionModel: 'local-browser',
      lifecycle: 'local-active-solve',
      supportsStreamingProgress: true,
      supportsWarmStart: true,
      supportsCancellation: true,
      supportsEvaluation: true,
      supportsRecommendedSettings: true,
      supportsActiveSolveInspection: true,
      progressTransport: 'shared-mailbox',
      progressMailbox: {
        transport: 'shared-mailbox',
        supported: true,
        requiresCrossOriginIsolation: true,
        crossOriginIsolated: true,
        sharedArrayBufferAvailable: true,
      },
    })),
    listSolvers: vi.fn(async () => ({ solvers: [] })),
    getSolverDescriptor: vi.fn(async () => ({
      kind: 'solver1',
      canonical_id: 'solver1',
      display_name: 'Solver 1',
      accepted_config_ids: ['solver1', 'SimulatedAnnealing'],
      capabilities: {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: true,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
      },
      notes: 'solver1 notes',
    })),
    getDefaultSolverSettings: vi.fn(async () => createSampleScenario().settings),
    validateScenario: vi.fn(async () => ({ valid: true, issues: [] })),
    recommendSettings: vi.fn(async () => createSampleScenario().settings),
    solveWithProgress: vi.fn(async () => ({
      selectedSettings: createSampleScenario().settings,
      runScenario: createSampleScenario(),
      solution: createSampleSolution(),
      lastProgress: null,
    })),
    solveWarmStart: vi.fn(async () => ({
      selectedSettings: createSampleScenario().settings,
      runScenario: createSampleScenario(),
      solution: createSampleSolution(),
      lastProgress: null,
    })),
    evaluateSolution: vi.fn(async () => createSampleSolution()),
    cancel: vi.fn(async () => undefined),
    ...overrides,
  };
}

vi.mock('../../services/evaluator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/evaluator')>();
  return {
    ...actual,
    evaluateCompliance: vi.fn(() => [{ title: 'ok', status: 'pass' }]),
  };
});

describe('dropPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeForTests(createRuntimeMock());
  });

  afterEach(() => {
    setRuntimeForTests(null);
  });

  it('finds the currently assigned group for a person in a session', () => {
    const schedule = groupBySessionAndGroup(createSampleSolution().assignments);

    expect(findAssignedGroup(schedule, 0, 'p1')).toBe('g1');
    expect(findAssignedGroup(schedule, 1, 'p2')).toBe('g2');
  });

  it('stages a move by replacing the session assignment for the moved person only', () => {
    const assignments = createSampleSolution().assignments;

    const staged = stagePersonMove(assignments, 'p1', 'g2', 0);

    expect(staged.filter((assignment) => assignment.person_id === 'p1' && assignment.session_id === 0)).toEqual([
      { person_id: 'p1', group_id: 'g2', session_id: 0 },
    ]);
    expect(staged.filter((assignment) => assignment.person_id === 'p1' && assignment.session_id === 1)).toEqual([
      { person_id: 'p1', group_id: 'g1', session_id: 1 },
    ]);
    expect(staged).toHaveLength(assignments.length);
  });

  it('builds an evaluated move baseline when runtime evaluation succeeds', async () => {
    const scenario = createSampleScenario();
    const draftAssignments = createSampleSolution().assignments;
    const compliance = [{ title: 'before', status: 'warn' }] as unknown as ReturnType<typeof evaluateCompliance>;
    const runtime = createRuntimeMock({
      evaluateSolution: vi.fn(async () =>
        createSampleSolution({
          final_score: 8,
          unique_contacts: 6,
          repetition_penalty: 1,
          attribute_balance_penalty: 2,
          constraint_penalty: 3,
        }),
      ),
    });
    setRuntimeForTests(runtime);

    const result = await buildMoveBaseline(scenario, draftAssignments, compliance);

    expect(runtime.evaluateSolution).toHaveBeenCalledWith({ scenario, assignments: draftAssignments });
    expect(evaluateCompliance).toHaveBeenCalled();
    expect(result).toEqual({
      score: {
        final_score: 8,
        unique_contacts: 6,
        repetition_penalty: 1,
        attribute_balance_penalty: 2,
        constraint_penalty: 3,
      },
      compliance: [{ title: 'ok', status: 'pass' }],
    });
  });

  it('falls back to empty move-baseline scores when evaluation fails or no scenario exists', async () => {
    const draftAssignments = createSampleSolution().assignments;
    const compliance = [{ title: 'before', status: 'warn' }] as unknown as ReturnType<typeof evaluateCompliance>;
    const runtime = createRuntimeMock({
      evaluateSolution: vi.fn(async () => {
        throw new Error('eval failed');
      }),
    });
    setRuntimeForTests(runtime);

    await expect(buildMoveBaseline(null, draftAssignments, compliance)).resolves.toEqual({
      score: {
        final_score: 0,
        unique_contacts: 0,
        repetition_penalty: 0,
        attribute_balance_penalty: 0,
        constraint_penalty: 0,
      },
      compliance,
    });

    await expect(buildMoveBaseline(createSampleScenario(), draftAssignments, compliance)).resolves.toEqual({
      score: {
        final_score: 0,
        unique_contacts: 0,
        repetition_penalty: 0,
        attribute_balance_penalty: 0,
        constraint_penalty: 0,
      },
      compliance,
    });
  });

  it('builds a before/after move report from evaluated assignments', async () => {
    const scenario = createSampleScenario();
    const beforeAssignments = createSampleSolution().assignments;
    const afterAssignments = stagePersonMove(beforeAssignments, 'p1', 'g2', 0);

    const runtime = createRuntimeMock({
      evaluateSolution: vi.fn()
        .mockResolvedValueOnce(createSampleSolution({ final_score: 10, unique_contacts: 4, constraint_penalty: 2 }))
        .mockResolvedValueOnce(createSampleSolution({ final_score: 7, unique_contacts: 6, constraint_penalty: 1 })),
    });
    setRuntimeForTests(runtime);

    const report = await buildMoveReportData(
      scenario,
      beforeAssignments,
      afterAssignments,
      [{ title: 'before', status: 'warn' }] as unknown as ReturnType<typeof evaluateCompliance>,
    );

    expect(report).toEqual({
      before: {
        score: {
          final_score: 10,
          unique_contacts: 4,
          repetition_penalty: 1,
          attribute_balance_penalty: 0,
          constraint_penalty: 2,
        },
        compliance: [{ title: 'ok', status: 'pass' }],
      },
      after: {
        score: {
          final_score: 7,
          unique_contacts: 6,
          repetition_penalty: 1,
          attribute_balance_penalty: 0,
          constraint_penalty: 1,
        },
        compliance: [{ title: 'ok', status: 'pass' }],
      },
      people: scenario.people,
    });
  });

  it('returns null when the after-move evaluation fails', async () => {
    const scenario = createSampleScenario();
    const beforeAssignments = createSampleSolution().assignments;
    const afterAssignments = stagePersonMove(beforeAssignments, 'p1', 'g2', 0);

    const runtime = createRuntimeMock({
      evaluateSolution: vi.fn()
        .mockResolvedValueOnce(createSampleSolution())
        .mockRejectedValueOnce(new Error('after failed')),
    });
    setRuntimeForTests(runtime);

    await expect(
      buildMoveReportData(
        scenario,
        beforeAssignments,
        afterAssignments,
        [{ title: 'before', status: 'warn' }] as unknown as ReturnType<typeof evaluateCompliance>,
      ),
    ).resolves.toBeNull();
  });
});
