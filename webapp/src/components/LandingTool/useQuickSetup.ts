import { useCallback, useMemo, useState } from 'react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import type { ToolPageConfig } from '../../pages/toolPageConfigs';
import { solveProblem } from '../../services/solver/solveProblem';
import { buildGroups, buildProblemFromDraft, parseParticipantInput } from '../../utils/quickSetup';
import type { AttributeDefinition, Problem, Solution } from '../../types';
import type {
  QuickSetupAnalysis,
  QuickSetupDraft,
  QuickSetupGroupResult,
  QuickSetupParticipant,
  QuickSetupResult,
  QuickSetupSessionResult,
} from './types';

const SAMPLE_NAMES = ['Alex', 'Sam', 'Priya', 'Jordan', 'Mina', 'Luis', 'Taylor', 'Casey'].join('\n');
const SAMPLE_CSV = [
  'name,team,role',
  'Alex,Blue,Engineer',
  'Sam,Blue,Designer',
  'Priya,Gold,Engineer',
  'Jordan,Gold,Facilitator',
  'Mina,Green,Research',
  'Luis,Green,Engineer',
].join('\n');

export interface QuickSetupController {
  draft: QuickSetupDraft;
  analysis: QuickSetupAnalysis;
  participantCount: number;
  estimatedGroupCount: number;
  estimatedGroupSize: number;
  result: QuickSetupResult | null;
  isSolving: boolean;
  errorMessage: string | null;
  canGenerate: boolean;
  draftStorageLabel: string;
  buildWorkspaceBridgePayload: () => {
    problem: Problem;
    solution?: Solution | null;
    attributeDefinitions?: AttributeDefinition[];
    currentProblemId?: string | null;
  };
  updateDraft: (updater: QuickSetupDraft | ((draft: QuickSetupDraft) => QuickSetupDraft)) => void;
  setPreset: (preset: QuickSetupDraft['preset']) => void;
  toggleAdvanced: () => void;
  generateGroups: () => void;
  reshuffle: () => void;
  resetDraft: () => void;
  loadSampleData: () => void;
  exportGroupsCsv: () => void;
  exportProjectDraft: () => void;
}

function defaultDraft(pageConfig: ToolPageConfig): QuickSetupDraft {
  return {
    participantInput: SAMPLE_NAMES,
    groupingMode: 'groupCount',
    groupingValue: 4,
    sessions: pageConfig.defaultPreset === 'networking' ? 3 : 1,
    preset: pageConfig.defaultPreset,
    avoidRepeatPairings: pageConfig.defaultPreset === 'networking',
    keepTogetherInput: '',
    avoidPairingsInput: '',
    inputMode: 'names',
    balanceAttributeKey: null,
    advancedOpen: false,
  };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function parseParticipants(draft: QuickSetupDraft): Pick<QuickSetupAnalysis, 'participants' | 'availableBalanceKeys'> {
  const parsed = parseParticipantInput(draft);
  return {
    participants: parsed.people.map((person) => ({
      id: person.id,
      name: person.id,
      attributes: person.attributes,
    })),
    availableBalanceKeys: parsed.attributeKeys,
  };
}

function parseConstraintLines(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(/[,+]/)
        .map((value) => value.trim())
        .filter(Boolean),
    )
    .filter((line) => line.length > 1);
}

function parsePairConstraints(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(/-|,/)
        .map((value) => value.trim())
        .filter(Boolean),
    )
    .filter((parts) => parts.length >= 2)
    .map(([left, right]) => ({ left, right }));
}

function analyzeDraft(draft: QuickSetupDraft): QuickSetupAnalysis {
  const { participants, availableBalanceKeys } = parseParticipants(draft);
  const nameSet = new Set(participants.map((participant) => normalizeName(participant.name)));
  const ignoredConstraintNames = new Set<string>();

  const keepTogetherGroups = parseConstraintLines(draft.keepTogetherInput)
    .map((names) => {
      const validNames = names.filter((name) => {
        const exists = nameSet.has(normalizeName(name));
        if (!exists) {
          ignoredConstraintNames.add(name);
        }
        return exists;
      });
      return { names: validNames };
    })
    .filter((group) => group.names.length > 1);

  const avoidPairings = parsePairConstraints(draft.avoidPairingsInput)
    .map(({ left, right }) => {
      const leftExists = nameSet.has(normalizeName(left));
      const rightExists = nameSet.has(normalizeName(right));
      if (!leftExists) {
        ignoredConstraintNames.add(left);
      }
      if (!rightExists) {
        ignoredConstraintNames.add(right);
      }
      return leftExists && rightExists ? { left, right } : null;
    })
    .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair));

  return {
    participants,
    availableBalanceKeys,
    keepTogetherGroups,
    avoidPairings,
    ignoredConstraintNames: [...ignoredConstraintNames],
  };
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function pairKey(left: string, right: string) {
  return [left, right].sort().join('::');
}

function buildEntities(participants: QuickSetupParticipant[], analysis: QuickSetupAnalysis) {
  const participantByName = new Map(
    participants.map((participant) => [normalizeName(participant.name), participant] as const),
  );
  const claimed = new Set<string>();
  const entities: QuickSetupParticipant[][] = [];

  for (const group of analysis.keepTogetherGroups) {
    const members = group.names
      .map((name) => participantByName.get(normalizeName(name)))
      .filter((participant): participant is QuickSetupParticipant => Boolean(participant))
      .filter((participant) => !claimed.has(participant.id));
    if (members.length > 1) {
      members.forEach((member) => claimed.add(member.id));
      entities.push(members);
    }
  }

  for (const participant of participants) {
    if (!claimed.has(participant.id)) {
      entities.push([participant]);
    }
  }

  return entities;
}

function generateSessions(draft: QuickSetupDraft, analysis: QuickSetupAnalysis, seed: number): QuickSetupResult {
  const participants = analysis.participants;
  const totalParticipants = participants.length;
  const groupCount =
    draft.groupingMode === 'groupCount'
      ? Math.max(1, draft.groupingValue)
      : Math.max(1, Math.ceil(totalParticipants / Math.max(1, draft.groupingValue)));
  const preferredGroupSize = Math.max(1, Math.ceil(totalParticipants / groupCount));
  const entities = buildEntities(participants, analysis);
  const random = mulberry32(seed);
  const pairCounts = new Map<string, number>();
  const sessions: QuickSetupSessionResult[] = [];

  const avoidPairs = new Set(
    analysis.avoidPairings.map((pair) => pairKey(normalizeName(pair.left), normalizeName(pair.right))),
  );

  const attributeTargets = new Map<string, Map<string, number>>();
  if (draft.balanceAttributeKey) {
    const counts = participants.reduce<Map<string, number>>((acc, participant) => {
      const value = participant.attributes[draft.balanceAttributeKey!];
      if (value) {
        acc.set(value, (acc.get(value) ?? 0) + 1);
      }
      return acc;
    }, new Map());
    attributeTargets.set(
      draft.balanceAttributeKey,
      new Map([...counts.entries()].map(([value, count]) => [value, count / groupCount])),
    );
  }

  for (let sessionIndex = 0; sessionIndex < Math.max(1, draft.sessions); sessionIndex += 1) {
    const groups: QuickSetupGroupResult[] = Array.from({ length: groupCount }, (_, index) => ({
      id: `Group ${index + 1}`,
      members: [],
    }));

    for (const entity of shuffled(entities, random)) {
      let bestGroup: QuickSetupGroupResult | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const group of groups) {
        const projectedMembers = [...group.members, ...entity];
        const projectedSize = projectedMembers.length;

        let invalid = false;
        for (const member of entity) {
          for (const existing of group.members) {
            if (avoidPairs.has(pairKey(normalizeName(member.name), normalizeName(existing.name)))) {
              invalid = true;
              break;
            }
          }
          if (invalid) {
            break;
          }
        }
        if (invalid) {
          continue;
        }

        let score = group.members.length * 2;
        score += Math.max(0, projectedSize - preferredGroupSize) * 8;

        if (draft.avoidRepeatPairings) {
          for (const member of entity) {
            for (const existing of group.members) {
              score += (pairCounts.get(pairKey(member.id, existing.id)) ?? 0) * 20;
            }
          }
        }

        if (draft.balanceAttributeKey && attributeTargets.has(draft.balanceAttributeKey)) {
          const targetCounts = attributeTargets.get(draft.balanceAttributeKey)!;
          const projectedCounts = projectedMembers.reduce<Map<string, number>>((acc, participant) => {
            const value = participant.attributes[draft.balanceAttributeKey!];
            if (value) {
              acc.set(value, (acc.get(value) ?? 0) + 1);
            }
            return acc;
          }, new Map());

          for (const [value, target] of targetCounts.entries()) {
            score += Math.abs((projectedCounts.get(value) ?? 0) - target) * 4;
          }
        }

        score += random();

        if (score < bestScore) {
          bestScore = score;
          bestGroup = group;
        }
      }

      (bestGroup ?? groups[0]).members.push(...entity);
    }

    if (draft.avoidRepeatPairings) {
      for (const group of groups) {
        for (let leftIndex = 0; leftIndex < group.members.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < group.members.length; rightIndex += 1) {
            const key = pairKey(group.members[leftIndex].id, group.members[rightIndex].id);
            pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }

    sessions.push({
      sessionNumber: sessionIndex + 1,
      groups,
    });
  }

  return {
    seed,
    generatedAt: new Date().toISOString(),
    sessions,
  };
}

function csvForResult(result: QuickSetupResult) {
  const lines = ['session,group,members'];
  for (const session of result.sessions) {
    for (const group of session.groups) {
      lines.push(`${session.sessionNumber},${group.id},"${group.members.map((member) => member.name).join(', ')}"`);
    }
  }
  return lines.join('\n');
}

function quickSetupResultFromSolution(problem: ReturnType<typeof buildProblemFromDraft>['problem'], solution: { assignments: Array<{ person_id: string; group_id: string; session_id: number }> }, seed: number): QuickSetupResult {
  const peopleById = new Map(
    problem.people.map((person) => [
      person.id,
      {
        id: person.id,
        name: person.id,
        attributes: person.attributes,
      } satisfies QuickSetupParticipant,
    ] as const),
  );

  const groupsBySession = new Map<number, Map<string, QuickSetupGroupResult>>();
  for (const assignment of solution.assignments) {
    if (!groupsBySession.has(assignment.session_id)) {
      groupsBySession.set(assignment.session_id, new Map(problem.groups.map((group) => [group.id, { id: group.id, members: [] }] as const)));
    }
    groupsBySession.get(assignment.session_id)?.get(assignment.group_id)?.members.push(
      peopleById.get(assignment.person_id) ?? {
        id: assignment.person_id,
        name: assignment.person_id,
        attributes: {},
      },
    );
  }

  const sessions: QuickSetupSessionResult[] = [...groupsBySession.entries()]
    .sort(([left], [right]) => left - right)
    .map(([sessionId, groups]) => ({
      sessionNumber: sessionId + 1,
      groups: [...groups.values()],
    }));

  return {
    seed,
    generatedAt: new Date().toISOString(),
    sessions,
  };
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useQuickSetup(pageConfig: ToolPageConfig): QuickSetupController {
  const storageKey = `groupmixer.quick-setup.${pageConfig.key}.v1`;
  const [draft, setDraft] = useLocalStorageState<QuickSetupDraft>(storageKey, defaultDraft(pageConfig));
  const [result, setResult] = useState<QuickSetupResult | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSolvedProblem, setLastSolvedProblem] = useState<Problem | null>(null);
  const [lastSolvedSolution, setLastSolvedSolution] = useState<Solution | null>(null);
  const [lastSolvedAttributeDefinitions, setLastSolvedAttributeDefinitions] = useState<AttributeDefinition[]>([]);

  const analysis = useMemo(() => analyzeDraft(draft), [draft]);
  const participantCount = analysis.participants.length;
  const estimatedGroups = useMemo(() => buildGroups(participantCount, draft), [participantCount, draft]);
  const estimatedGroupCount = estimatedGroups.length;
  const estimatedGroupSize = estimatedGroups[0]?.size ?? 0;
  const canGenerate = participantCount >= 2 && draft.groupingValue > 0;

  const updateDraft = useCallback(
    (updater: QuickSetupDraft | ((draft: QuickSetupDraft) => QuickSetupDraft)) => {
      setDraft(updater);
    },
    [setDraft],
  );

  const setPreset = useCallback(
    (preset: QuickSetupDraft['preset']) => {
      setDraft((current) => ({
        ...current,
        preset,
        sessions: preset === 'networking' ? Math.max(2, current.sessions) : current.sessions,
        avoidRepeatPairings: preset === 'networking' ? true : current.avoidRepeatPairings,
      }));
    },
    [setDraft],
  );

  const toggleAdvanced = useCallback(() => {
    setDraft((current) => ({ ...current, advancedOpen: !current.advancedOpen }));
  }, [setDraft]);

  const generateWithSeed = useCallback(
    async (seed: number) => {
      if (!canGenerate) {
        return;
      }
      setIsSolving(true);
      setErrorMessage(null);
      const mapped = buildProblemFromDraft(draft);
      try {
        const { solution } = await solveProblem({
          problem: mapped.problem,
          useRecommendedSettings: true,
          desiredRuntimeSeconds: draft.preset === 'networking' ? 5 : 3,
        });
        setLastSolvedProblem(mapped.problem);
        setLastSolvedSolution(solution);
        setLastSolvedAttributeDefinitions(mapped.attributeDefinitions);
        setResult(quickSetupResultFromSolution(mapped.problem, solution, seed));
      } catch (error) {
        console.error('[QuickSetup] Falling back to local grouping after solve failure:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Unable to solve this setup right now. Showing a local draft grouping instead.');
        setLastSolvedProblem(null);
        setLastSolvedSolution(null);
        setLastSolvedAttributeDefinitions([]);
        setResult(generateSessions(draft, analysis, seed));
      } finally {
        setIsSolving(false);
      }
    },
    [analysis, canGenerate, draft],
  );

  const generateGroups = useCallback(() => {
    void generateWithSeed(Date.now());
  }, [generateWithSeed]);

  const reshuffle = useCallback(() => {
    void generateWithSeed(Date.now() + Math.floor(Math.random() * 100000));
  }, [generateWithSeed]);

  const resetDraft = useCallback(() => {
    setDraft(defaultDraft(pageConfig));
    setResult(null);
    setLastSolvedProblem(null);
    setLastSolvedSolution(null);
    setLastSolvedAttributeDefinitions([]);
    setErrorMessage(null);
  }, [pageConfig, setDraft]);

  const loadSampleData = useCallback(() => {
    setDraft((current) => ({
      ...current,
      participantInput: current.inputMode === 'csv' ? SAMPLE_CSV : SAMPLE_NAMES,
    }));
  }, [setDraft]);

  const exportGroupsCsv = useCallback(() => {
    if (!result) {
      return;
    }
    downloadBlob('groupmixer-groups.csv', csvForResult(result), 'text/csv');
  }, [result]);

  const exportProjectDraft = useCallback(() => {
    const mapped = buildProblemFromDraft(draft);
    downloadBlob(
      'groupmixer-quick-setup.json',
      JSON.stringify({ draft, pageKey: pageConfig.key, ...mapped }, null, 2),
      'application/json',
    );
  }, [draft, pageConfig.key]);

  const buildWorkspaceBridgePayload = useCallback(() => {
    if (lastSolvedProblem) {
      return {
        problem: lastSolvedProblem,
        solution: lastSolvedSolution,
        attributeDefinitions: lastSolvedAttributeDefinitions,
        currentProblemId: null,
      };
    }

    const mapped = buildProblemFromDraft(draft);
    return {
      problem: mapped.problem,
      solution: null,
      attributeDefinitions: mapped.attributeDefinitions,
      currentProblemId: null,
    };
  }, [draft, lastSolvedAttributeDefinitions, lastSolvedProblem, lastSolvedSolution]);

  return {
    draft,
    analysis,
    participantCount,
    estimatedGroupCount,
    estimatedGroupSize,
    result,
    isSolving,
    errorMessage,
    canGenerate,
    draftStorageLabel: 'Saved locally in this browser',
    buildWorkspaceBridgePayload,
    updateDraft,
    setPreset,
    toggleAdvanced,
    generateGroups,
    reshuffle,
    resetDraft,
    loadSampleData,
    exportGroupsCsv,
    exportProjectDraft,
  };
}
