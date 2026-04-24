import { useCallback, useMemo, useState } from 'react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { getLandingSampleCsvText, getLandingSampleNamesText } from '../../i18n/landingSamples';
import { getLandingUiContent } from '../../i18n/landingUi';
import type { ToolPageConfig } from '../../pages/toolPageConfigs';
import type { ToolPageSharedUiContent } from '../../pages/toolPageTypes';
import { solveScenario } from '../../services/solver/solveScenario';
import { namifyPersonIdsInText } from '../../utils/personReferenceText';
import { buildGroups, buildScenarioFromDraft, parseParticipantInput } from '../../utils/quickSetup';
import {
  normalizeBalanceTargets,
  normalizeManualBalanceAttributeKeys,
  syncAutoBalanceTargets,
} from '../../utils/quickSetup/attributeBalanceTargets';
import { normalizeFixedAssignmentRows, resolveFixedAssignmentGroupId } from '../../utils/quickSetup/fixedAssignments';
import { createQuickSetupDraftFromScenario } from '../../utils/quickSetup/landingDemo';
import { normalizeParticipantColumns, withParticipantColumns } from '../../utils/quickSetup/participantColumns';
import type { AttributeDefinition, Scenario, Solution } from '../../types';
import type {
  QuickSetupAnalysis,
  QuickSetupDraft,
  QuickSetupFixedAssignment,
  QuickSetupGroupResult,
  QuickSetupParticipant,
  QuickSetupResult,
  QuickSetupSessionResult,
} from './types';

export interface ToolController {
  ui: ToolPageSharedUiContent;
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
  workspacePayload: {
    scenario: Scenario;
    solution?: Solution | null;
    attributeDefinitions?: AttributeDefinition[];
    currentScenarioId?: string | null;
  };
  buildWorkspaceBridgePayload: () => {
    scenario: Scenario;
    solution?: Solution | null;
    attributeDefinitions?: AttributeDefinition[];
    currentScenarioId?: string | null;
  };
  updateDraft: (updater: QuickSetupDraft | ((draft: QuickSetupDraft) => QuickSetupDraft)) => void;
  setPreset: (preset: QuickSetupDraft['preset']) => void;
  toggleAdvanced: () => void;
  generateGroups: () => void;
  reshuffle: () => void;
  resetDraft: () => void;
  clearDraft: () => void;
  hasAnyInputData: boolean;
  loadSampleData: () => void;
  loadScenarioDraft: (scenario: Scenario) => boolean;
  exportGroupsCsv: () => void;
  exportProjectDraft: () => void;
}

function defaultDraft(pageConfig: ToolPageConfig): QuickSetupDraft {
  const defaults = pageConfig.quickSetupDefaults;
  const draft: QuickSetupDraft = {
    participantInput: defaults.inputMode === 'csv'
      ? getLandingSampleCsvText(pageConfig.locale)
      : getLandingSampleNamesText(pageConfig.locale),
    groupingMode: defaults.groupingMode,
    groupingValue: defaults.groupingValue,
    sessions: defaults.sessions,
    avoidRepeatPairings: true,
    preset: pageConfig.defaultPreset,
    keepTogetherInput: defaults.keepTogetherInput,
    avoidPairingsInput: defaults.avoidPairingsInput,
    inputMode: defaults.inputMode,
    fixedAssignments: [],
    balanceAttributeKey: defaults.balanceAttributeKey,
    manualBalanceAttributeKeys: [],
    advancedOpen: defaults.advancedOpen,
    workspaceScenarioId: null,
  };

  return {
    ...draft,
    participantColumns: normalizeParticipantColumns(draft),
  };
}

function emptyDraft(pageConfig: ToolPageConfig): QuickSetupDraft {
  const cleared = defaultDraft(pageConfig);

  return normalizeQuickSetupDraft({
    ...withParticipantColumns(cleared, [{ id: 'name', name: 'Name', values: '' }]),
    keepTogetherInput: '',
    avoidPairingsInput: '',
    fixedAssignments: [],
    balanceAttributeKey: null,
    balanceTargets: {},
    manualBalanceAttributeKeys: [],
    workspaceScenarioId: null,
  });
}

function draftsMatch(left: QuickSetupDraft, right: QuickSetupDraft): boolean {
  return JSON.stringify(normalizeQuickSetupDraft(left)) === JSON.stringify(normalizeQuickSetupDraft(right));
}

function normalizeQuickSetupDraft(draft: QuickSetupDraft): QuickSetupDraft {
  const nextDraft = {
    ...draft,
    avoidRepeatPairings: draft.avoidRepeatPairings ?? true,
    fixedAssignments: normalizeFixedAssignmentRows(draft.fixedAssignments),
    participantColumns: normalizeParticipantColumns(draft),
    balanceTargets: normalizeBalanceTargets(draft.balanceTargets),
    manualBalanceAttributeKeys: normalizeManualBalanceAttributeKeys(
      draft.manualBalanceAttributeKeys,
      normalizeParticipantColumns(draft).slice(1).map((column) => column.name.trim()),
      draft.balanceTargets,
    ),
  };
  const parsed = parseParticipantInput(nextDraft);
  const groups = buildGroups(parsed.people.length, nextDraft);
  const syncedBalanceTargets = syncAutoBalanceTargets({
    balanceTargets: nextDraft.balanceTargets,
    manualBalanceAttributeKeys: nextDraft.manualBalanceAttributeKeys,
    people: parsed.people,
    groups,
    availableAttributeKeys: parsed.attributeKeys,
  });

  return {
    ...nextDraft,
    balanceTargets: syncedBalanceTargets.balanceTargets,
    manualBalanceAttributeKeys: syncedBalanceTargets.manualBalanceAttributeKeys,
  };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function parseParticipants(draft: QuickSetupDraft): Pick<QuickSetupAnalysis, 'participants' | 'availableBalanceKeys' | 'balanceAttributes'> {
  const parsed = parseParticipantInput(draft);
  const balanceAttributes = parsed.attributeKeys.map((key) => ({
    key,
    values: [...new Set(parsed.people.map((person) => person.attributes[key]).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
  }));
  return {
    participants: parsed.people.map((person) => ({
      id: person.id,
      name: person.id,
      attributes: person.attributes,
    })),
    availableBalanceKeys: balanceAttributes.map((attribute) => attribute.key),
    balanceAttributes,
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
  const { participants, availableBalanceKeys, balanceAttributes } = parseParticipants(draft);
  const participantByName = new Map(participants.map((participant) => [normalizeName(participant.name), participant] as const));
  const nameSet = new Set(participantByName.keys());
  const groups = buildGroups(participants.length, draft);
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

  const resolvedFixedAssignments = new Map<string, QuickSetupFixedAssignment>();
  for (const assignment of normalizeFixedAssignmentRows(draft.fixedAssignments)) {
    if (assignment.personId.length === 0 || assignment.groupId.length === 0) {
      continue;
    }

    const participant = participantByName.get(normalizeName(assignment.personId));
    if (!participant) {
      ignoredConstraintNames.add(assignment.personId);
      continue;
    }

    const groupId = resolveFixedAssignmentGroupId(assignment.groupId, groups);
    if (!groupId) {
      continue;
    }

    resolvedFixedAssignments.set(participant.id, {
      personId: participant.id,
      groupId,
    });
  }

  const fixedAssignments = [...resolvedFixedAssignments.values()]
    .map((assignment) => {
      return assignment satisfies QuickSetupFixedAssignment;
    })
    .filter((assignment): assignment is QuickSetupFixedAssignment => Boolean(assignment));

  return {
    participants,
    availableBalanceKeys,
    balanceAttributes,
    fixedAssignments,
    keepTogetherGroups,
    avoidPairings,
    ignoredConstraintNames: [...ignoredConstraintNames],
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

function quickSetupResultFromSolution(scenario: ReturnType<typeof buildScenarioFromDraft>['scenario'], solution: { assignments: Array<{ person_id: string; group_id: string; session_id: number }> }, seed: number): QuickSetupResult {
  const peopleById = new Map(
    scenario.people.map((person) => [
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
      groupsBySession.set(assignment.session_id, new Map(scenario.groups.map((group) => [group.id, { id: group.id, members: [] }] as const)));
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

export function useToolSetup(pageConfig: ToolPageConfig): ToolController {
  const ui = getLandingUiContent(pageConfig.locale);
  const storageKey = `groupmixer.quick-setup.${pageConfig.key}.v1`;
  const [storedDraft, setDraft] = useLocalStorageState<QuickSetupDraft>(storageKey, defaultDraft(pageConfig));
  const draft = useMemo(() => normalizeQuickSetupDraft(storedDraft), [storedDraft]);
  const [result, setResult] = useState<QuickSetupResult | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSolvedScenario, setLastSolvedScenario] = useState<Scenario | null>(null);
  const [lastSolvedSolution, setLastSolvedSolution] = useState<Solution | null>(null);
  const [lastSolvedAttributeDefinitions, setLastSolvedAttributeDefinitions] = useState<AttributeDefinition[]>([]);
  const sampleNames = useMemo(() => getLandingSampleNamesText(pageConfig.locale), [pageConfig.locale]);
  const sampleCsv = useMemo(() => getLandingSampleCsvText(pageConfig.locale), [pageConfig.locale]);

  const analysis = useMemo(() => analyzeDraft(draft), [draft]);
  const participantCount = analysis.participants.length;
  const estimatedGroups = useMemo(() => buildGroups(participantCount, draft), [participantCount, draft]);
  const estimatedGroupCount = estimatedGroups.length;
  const estimatedGroupSize = estimatedGroups[0]?.size ?? 0;
  const canGenerate = participantCount >= 2 && draft.groupingValue > 0;

  const workspacePayload = useMemo(() => {
    if (lastSolvedScenario) {
      return {
        scenario: lastSolvedScenario,
        solution: lastSolvedSolution,
        attributeDefinitions: lastSolvedAttributeDefinitions,
        currentScenarioId: draft.workspaceScenarioId ?? null,
      };
    }

    const mapped = buildScenarioFromDraft(draft);
    return {
      scenario: mapped.scenario,
      solution: null,
      attributeDefinitions: mapped.attributeDefinitions,
      currentScenarioId: draft.workspaceScenarioId ?? null,
    };
  }, [draft, lastSolvedAttributeDefinitions, lastSolvedScenario, lastSolvedSolution]);

  const updateDraft = useCallback(
    (updater: QuickSetupDraft | ((draft: QuickSetupDraft) => QuickSetupDraft)) => {
      setDraft((current) => normalizeQuickSetupDraft(typeof updater === 'function'
        ? updater(normalizeQuickSetupDraft(current))
        : updater));
    },
    [setDraft],
  );

  const setPreset = useCallback(
    (preset: QuickSetupDraft['preset']) => {
      setDraft((current) => ({
        ...current,
        preset,
        sessions: preset === 'networking' ? Math.max(2, current.sessions) : current.sessions,
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
      const mapped = buildScenarioFromDraft(draft);
      try {
        const { solution } = await solveScenario({
          scenario: mapped.scenario,
          useRecommendedSettings: true,
          desiredRuntimeSeconds: 1,
        });
        setLastSolvedScenario(mapped.scenario);
        setLastSolvedSolution(solution);
        setLastSolvedAttributeDefinitions(mapped.attributeDefinitions);
        setResult(quickSetupResultFromSolution(mapped.scenario, solution, seed));
      } catch (error) {
        const solverErrorMessage = namifyPersonIdsInText(
          error instanceof Error ? error.message : 'Unknown error',
          mapped.scenario.people,
        );
        console.error('[EmbeddableTool] Solver failed:', error);
        setErrorMessage(solverErrorMessage);
        setLastSolvedScenario(null);
        setLastSolvedSolution(null);
        setLastSolvedAttributeDefinitions([]);
        setResult(null);
      } finally {
        setIsSolving(false);
      }
    },
    [canGenerate, draft],
  );

  const generateGroups = useCallback(() => {
    void generateWithSeed(Date.now());
  }, [generateWithSeed]);

  const reshuffle = useCallback(() => {
    void generateWithSeed(Date.now() + Math.floor(Math.random() * 100000));
  }, [generateWithSeed]);

  const clearDraft = useCallback(() => {
    setDraft(emptyDraft(pageConfig));
    setResult(null);
    setLastSolvedScenario(null);
    setLastSolvedSolution(null);
    setLastSolvedAttributeDefinitions([]);
    setErrorMessage(null);
  }, [pageConfig, setDraft]);

  const resetDraft = useCallback(() => {
    setDraft(defaultDraft(pageConfig));
    setResult(null);
    setLastSolvedScenario(null);
    setLastSolvedSolution(null);
    setLastSolvedAttributeDefinitions([]);
    setErrorMessage(null);
  }, [pageConfig, setDraft]);

  const hasAnyInputData = useMemo(
    () => !draftsMatch(draft, emptyDraft(pageConfig)) || result !== null || errorMessage !== null,
    [draft, errorMessage, pageConfig, result],
  );

  const loadSampleData = useCallback(() => {
    setDraft((current) => ({
      ...withParticipantColumns(current, normalizeParticipantColumns({
        participantInput: current.inputMode === 'csv' ? sampleCsv : sampleNames,
        inputMode: current.inputMode,
        participantColumns: undefined,
      })),
    }));
  }, [sampleCsv, sampleNames, setDraft]);

  const loadScenarioDraft = useCallback((scenario: Scenario) => {
    const nextDraft = createQuickSetupDraftFromScenario(scenario, draft);
    if (!nextDraft) {
      return false;
    }

    setDraft(nextDraft);
    setResult(null);
    setLastSolvedScenario(null);
    setLastSolvedSolution(null);
    setLastSolvedAttributeDefinitions([]);
    setErrorMessage(null);
    return true;
  }, [draft, setDraft]);

  const exportGroupsCsv = useCallback(() => {
    if (!result) {
      return;
    }
    downloadBlob('groupmixer-groups.csv', csvForResult(result), 'text/csv');
  }, [result]);

  const exportProjectDraft = useCallback(() => {
    const mapped = buildScenarioFromDraft(draft);
    downloadBlob(
      'groupmixer-embeddable-tool-draft.json',
      JSON.stringify({ draft, pageKey: pageConfig.key, ...mapped }, null, 2),
      'application/json',
    );
  }, [draft, pageConfig.key]);

  const buildWorkspaceBridgePayload = useCallback(() => {
    return workspacePayload;
  }, [workspacePayload]);

  return {
    ui,
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
    workspacePayload,
    buildWorkspaceBridgePayload,
    updateDraft,
    setPreset,
    toggleAdvanced,
    generateGroups,
    reshuffle,
    resetDraft,
    clearDraft,
    hasAnyInputData,
    loadSampleData,
    loadScenarioDraft,
    exportGroupsCsv,
    exportProjectDraft,
  };
}
