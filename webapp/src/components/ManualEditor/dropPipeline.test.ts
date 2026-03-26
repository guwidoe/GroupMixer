import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildMoveBaseline,
  buildMoveReportData,
  findAssignedGroup,
  stagePersonMove,
} from './dropPipeline';
import { createSampleScenario, createSampleSolution } from '../../test/fixtures';
import { groupBySessionAndGroup } from './utils';
import { wasmService } from '../../services/wasm';
import { evaluateCompliance } from '../../services/evaluator';

vi.mock('../../services/wasm', () => ({
  wasmService: {
    evaluateSolution: vi.fn(),
  },
}));

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
    vi.mocked(wasmService.evaluateSolution).mockResolvedValue(
      createSampleSolution({
        final_score: 8,
        unique_contacts: 6,
        repetition_penalty: 1,
        attribute_balance_penalty: 2,
        constraint_penalty: 3,
      }),
    );

    const result = await buildMoveBaseline(scenario, draftAssignments, compliance);

    expect(wasmService.evaluateSolution).toHaveBeenCalledWith(scenario, draftAssignments);
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
    vi.mocked(wasmService.evaluateSolution).mockRejectedValue(new Error('eval failed'));

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

    vi.mocked(wasmService.evaluateSolution)
      .mockResolvedValueOnce(createSampleSolution({ final_score: 10, unique_contacts: 4, constraint_penalty: 2 }))
      .mockResolvedValueOnce(createSampleSolution({ final_score: 7, unique_contacts: 6, constraint_penalty: 1 }));

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

    vi.mocked(wasmService.evaluateSolution)
      .mockResolvedValueOnce(createSampleSolution())
      .mockRejectedValueOnce(new Error('after failed'));

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
