/**
 * Scenario slice - manages the current scenario document state and CRUD operations.
 */

import type { Scenario } from '../../types';
import { createDefaultSolverSettings } from '../../services/solverUi';
import type { ScenarioState, ScenarioActions, StoreSlice } from '../types';
import { scenarioStorage } from '../../services/scenarioStorage';
import { initialSolverState } from './solverSlice';
import {
  createScenarioDocument,
  getSavedScenarioDocument,
  getScenarioDocumentFromState,
  getScenarioDocumentState,
  replaceSavedScenarioDocument,
} from '../scenarioDocument';

const DEFAULT_SETTINGS = createDefaultSolverSettings();

function createEmptyScenario(): Scenario {
  return {
    people: [],
    groups: [],
    num_sessions: 3,
    constraints: [],
    settings: DEFAULT_SETTINGS,
  };
}

export const createScenarioSlice: StoreSlice<ScenarioState & ScenarioActions> = (
  set,
  get,
) => ({
  scenarioDocument: null,
  scenario: null,

  setScenarioDocument: (document, options) => {
    const nextDocument = createScenarioDocument(document.scenario, document.attributeDefinitions);
    const { currentScenarioId } = get();

    if (options?.persist !== false && currentScenarioId) {
      scenarioStorage.updateScenario(currentScenarioId, nextDocument.scenario, nextDocument.attributeDefinitions);
    }

    set((state) => ({
      ...getScenarioDocumentState(nextDocument, state.attributeDefinitions),
      savedScenarios:
        currentScenarioId && state.savedScenarios[currentScenarioId]
          ? {
              ...state.savedScenarios,
              [currentScenarioId]: replaceSavedScenarioDocument(state.savedScenarios[currentScenarioId], nextDocument),
            }
          : state.savedScenarios,
    }));
  },

  updateScenarioDocument: (updater, options) => {
    const currentDocument = getScenarioDocumentFromState(get());
    if (!currentDocument) {
      return;
    }

    get().setScenarioDocument(updater(currentDocument), options);
  },

  setScenario: (scenario) => {
    const currentDocument = getScenarioDocumentFromState(get());
    get().setScenarioDocument({
      scenario,
      attributeDefinitions: currentDocument?.attributeDefinitions ?? get().attributeDefinitions,
    });
  },

  updateScenario: (updates) => {
    get().updateScenarioDocument((currentDocument) => ({
      ...currentDocument,
      scenario: {
        ...currentDocument.scenario,
        ...updates,
      },
    }));
  },

  updateCurrentScenario: (scenarioId, scenario) => {
    const currentDocument = getScenarioDocumentFromState(get());
    const nextDocument = createScenarioDocument(
      scenario,
      currentDocument?.attributeDefinitions ?? get().attributeDefinitions,
    );
    scenarioStorage.updateScenario(scenarioId, nextDocument.scenario, nextDocument.attributeDefinitions);

    set((state) => ({
      savedScenarios: state.savedScenarios[scenarioId]
        ? {
            ...state.savedScenarios,
            [scenarioId]: replaceSavedScenarioDocument(state.savedScenarios[scenarioId], nextDocument),
          }
        : state.savedScenarios,
    }));
  },

  resolveScenario: () => {
    const currentDocument = getScenarioDocumentFromState(get());
    if (currentDocument) {
      return currentDocument.scenario;
    }

    const { currentScenarioId, savedScenarios } = get();
    if (currentScenarioId && savedScenarios[currentScenarioId]) {
      const savedScenario = savedScenarios[currentScenarioId];
      const document = getSavedScenarioDocument(savedScenario);
      set({
        ...getScenarioDocumentState(document, get().attributeDefinitions),
        currentResultId: null,
        solution: null,
        solverState: initialSolverState,
      });
      return document.scenario;
    }

    const allScenarios = Object.values(savedScenarios);
    if (allScenarios.length > 0) {
      const firstScenario = allScenarios[0];
      const document = getSavedScenarioDocument(firstScenario);
      scenarioStorage.setCurrentScenarioId(firstScenario.id);
      set({
        ...getScenarioDocumentState(document, get().attributeDefinitions),
        currentScenarioId: firstScenario.id,
        currentResultId: null,
        solution: null,
        selectedResultIds: [],
        solverState: initialSolverState,
      });
      return document.scenario;
    }

    const { ui } = get();
    if (ui.isLoading) {
      return {
        people: [],
        groups: [],
        num_sessions: 3,
        constraints: [],
        settings: DEFAULT_SETTINGS,
      };
    }

    const emptyScenario = createEmptyScenario();
    const document = createScenarioDocument(emptyScenario, get().attributeDefinitions);
    set(getScenarioDocumentState(document, get().attributeDefinitions));
    return emptyScenario;
  },

  ensureScenarioExists: () => {
    const currentDocument = getScenarioDocumentFromState(get());
    if (currentDocument) {
      return currentDocument.scenario;
    }

    const { currentScenarioId, savedScenarios } = get();
    if (currentScenarioId && savedScenarios[currentScenarioId]) {
      const savedScenario = savedScenarios[currentScenarioId];
      const document = getSavedScenarioDocument(savedScenario);
      set({
        ...getScenarioDocumentState(document, get().attributeDefinitions),
        currentResultId: null,
        solution: null,
        solverState: initialSolverState,
      });
      return document.scenario;
    }

    const allScenarios = Object.values(savedScenarios);
    if (allScenarios.length > 0) {
      const firstScenario = allScenarios[0];
      const document = getSavedScenarioDocument(firstScenario);
      scenarioStorage.setCurrentScenarioId(firstScenario.id);
      set({
        ...getScenarioDocumentState(document, get().attributeDefinitions),
        currentScenarioId: firstScenario.id,
        currentResultId: null,
        solution: null,
        selectedResultIds: [],
        solverState: initialSolverState,
      });
      return document.scenario;
    }

    const emptyScenario = createEmptyScenario();
    const savedScenario = scenarioStorage.createScenario(
      'Untitled Scenario',
      emptyScenario,
      get().attributeDefinitions,
    );
    const document = getSavedScenarioDocument(savedScenario);

    set({
      ...getScenarioDocumentState(document, get().attributeDefinitions),
      currentScenarioId: savedScenario.id,
      currentResultId: null,
      savedScenarios: {
        ...get().savedScenarios,
        [savedScenario.id]: savedScenario,
      },
    });

    get().addNotification({
      type: 'info',
      title: 'New Scenario Created',
      message: 'A new scenario has been created and saved.',
    });

    return document.scenario;
  },
});
