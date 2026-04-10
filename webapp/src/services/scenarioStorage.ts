import type {
  AttributeDefinition,
  SavedScenario,
  Scenario,
  ScenarioResult,
  ScenarioSummary,
  ExportedScenario,
  SolverSettings,
  Solution,
} from "../types";
import { migrateSavedScenario, resolveScenarioWorkspaceState } from './scenarioAttributes';

export { compareScenarioConfigurations, type ScenarioConfigDifference } from "./scenarioStorage/compare";

const STORAGE_KEY = "people-distributor-scenarios";
const CURRENT_PROBLEM_KEY = "people-distributor-current-scenario";
const VERSION = "1.0.0";

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
    .join(",")}}`;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeScenarioForDraftIdentity(scenario: Scenario): Scenario {
  return {
    ...scenario,
    people: scenario.people.map((person) => {
      const normalizedPerson = { ...person };
      delete normalizedPerson.attributeValues;
      return normalizedPerson;
    }),
  };
}

export function buildScenarioDraftIdentityHash(name: string, scenario: Scenario): string {
  return hashString(stableSerialize({ name, scenario: normalizeScenarioForDraftIdentity(scenario) }));
}

export class ScenarioStorageService {
  private autoSaveTimeout: number | null = null;
  private readonly autoSaveDelay = 2000; // 2 seconds

  // Generate a globally unique ID
  private generateGloballyUniqueId(existingIds: Set<string>): string {
    let newId: string;
    do {
      newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    } while (existingIds.has(newId));
    return newId;
  }

  // Get all saved scenarios
  getAllScenarios(): Record<string, SavedScenario> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? (JSON.parse(stored) as Record<string, SavedScenario>) : {};
      let mutated = false;
      const migrated = Object.fromEntries(
        Object.entries(parsed).map(([id, scenario]) => {
          const nextScenario = migrateSavedScenario(scenario);
          if (JSON.stringify(nextScenario) !== JSON.stringify(scenario)) {
            mutated = true;
          }
          return [id, nextScenario];
        }),
      );

      if (mutated) {
        this.writeScenarios(migrated);
      }

      return migrated;
    } catch (error) {
      console.error("Failed to load scenarios from storage:", error);
      return {};
    }
  }

  // Get scenario summaries for quick overview
  getScenarioSummaries(): ScenarioSummary[] {
    const scenarios = this.getAllScenarios();
    return Object.values(scenarios).map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      peopleCount: scenario.scenario.people.length,
      groupsCount: scenario.scenario.groups.length,
      sessionsCount: scenario.scenario.num_sessions,
      resultsCount: scenario.results.length,
      createdAt: scenario.createdAt,
      updatedAt: scenario.updatedAt,
      isTemplate: scenario.isTemplate,
    }));
  }

  // Get a specific scenario
  getScenario(id: string): SavedScenario | null {
    const scenarios = this.getAllScenarios();
    return scenarios[id] || null;
  }

  findScenarioByDraftIdentity(name: string, scenario: Scenario): SavedScenario | null {
    const targetHash = buildScenarioDraftIdentityHash(name, scenario);
    const allScenarios = Object.values(this.getAllScenarios()).sort(
      (left, right) => right.updatedAt - left.updatedAt
    );

    return (
      allScenarios.find(
        (savedScenario) => buildScenarioDraftIdentityHash(savedScenario.name, savedScenario.scenario) === targetHash
      ) ?? null
    );
  }

  // Save or update a scenario
  saveScenario(scenario: SavedScenario): void {
    const scenarios = this.getAllScenarios();
    scenarios[scenario.id] = {
      ...scenario,
      updatedAt: Date.now(),
    };

    this.writeScenarios(scenarios);
  }

  private writeScenarios(scenarios: Record<string, SavedScenario>): void {

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
    } catch (error) {
      console.error("Failed to save scenario to storage:", error);
      throw new Error(
        "Storage quota exceeded. Please delete some scenarios or export them to files."
      );
    }
  }

  // Create a new scenario
  createScenario(
    name: string,
    scenario: Scenario,
    attributeDefinitionsOrTemplate: AttributeDefinition[] | boolean = [],
    isTemplate = false,
  ): SavedScenario {
    const attributeDefinitions = Array.isArray(attributeDefinitionsOrTemplate)
      ? attributeDefinitionsOrTemplate
      : [];
    const templateFlag = typeof attributeDefinitionsOrTemplate === 'boolean' ? attributeDefinitionsOrTemplate : isTemplate;
    const now = Date.now();
    const allScenarios = this.getAllScenarios();
    const allScenarioIds = new Set(Object.keys(allScenarios));
    const id = this.generateGloballyUniqueId(allScenarioIds);
    const resolvedWorkspace = resolveScenarioWorkspaceState(scenario, attributeDefinitions);
    const savedScenario: SavedScenario = {
      id,
      name,
      scenario: resolvedWorkspace.scenario,
      attributeDefinitions: resolvedWorkspace.attributeDefinitions,
      results: [],
      createdAt: now,
      updatedAt: now,
      isTemplate: templateFlag,
    };

    this.saveScenario(savedScenario);
    return savedScenario;
  }

  // Update scenario definition (triggers auto-save)
  updateScenario(id: string, scenario: Scenario, attributeDefinitions?: AttributeDefinition[]): void {
    const savedScenario = this.getScenario(id);
    if (!savedScenario) {
      throw new Error(`Scenario with ID ${id} not found`);
    }

    const resolvedWorkspace = resolveScenarioWorkspaceState(
      scenario,
      attributeDefinitions ?? savedScenario.attributeDefinitions,
    );
    savedScenario.attributeDefinitions = resolvedWorkspace.attributeDefinitions;
    savedScenario.scenario = resolvedWorkspace.scenario;
    this.scheduleAutoSave(savedScenario);
  }

  // Add a result to a scenario
  addResult(
    scenarioId: string,
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string,
    currentScenarioState?: Scenario // Optional: pass current scenario state to avoid stale data
  ): ScenarioResult {
    const savedScenario = this.getScenario(scenarioId);
    if (!savedScenario) {
      throw new Error(`Scenario with ID ${scenarioId} not found`);
    }
    // Collect all result IDs in the current scenario
    const resultIds = new Set<string>(savedScenario.results.map((r) => r.id));
    const id = this.generateGloballyUniqueId(resultIds);

    // Use the current scenario state if provided, otherwise fall back to saved state
    const scenarioToSnapshot = currentScenarioState || savedScenario.scenario;

    // Capture the current scenario configuration as a snapshot
    const scenarioSnapshot = {
      people: scenarioToSnapshot.people,
      groups: scenarioToSnapshot.groups,
      num_sessions: scenarioToSnapshot.num_sessions,
      objectives: scenarioToSnapshot.objectives,
      constraints: scenarioToSnapshot.constraints,
    };

    const result: ScenarioResult = {
      id,
      name: customName || `Result ${savedScenario.results.length + 1}`,
      solution,
      solverSettings,
      scenarioSnapshot,
      timestamp: Date.now(),
      duration: solution.elapsed_time_ms,
    };

    savedScenario.results.push(result);
    this.saveScenario(savedScenario);

    return result;
  }

  // Update result name
  updateResultName(scenarioId: string, resultId: string, newName: string): void {
    const savedScenario = this.getScenario(scenarioId);
    if (!savedScenario) {
      throw new Error(`Scenario with ID ${scenarioId} not found`);
    }

    const result = savedScenario.results.find((r) => r.id === resultId);
    if (!result) {
      throw new Error(`Result with ID ${resultId} not found`);
    }

    result.name = newName;
    this.saveScenario(savedScenario);
  }

  // Delete a result
  deleteResult(scenarioId: string, resultId: string): void {
    const savedScenario = this.getScenario(scenarioId);
    if (!savedScenario) {
      throw new Error(`Scenario with ID ${scenarioId} not found`);
    }

    savedScenario.results = savedScenario.results.filter(
      (r) => r.id !== resultId
    );
    this.saveScenario(savedScenario);
  }

  // Delete a scenario
  deleteScenario(id: string): void {
    const scenarios = this.getAllScenarios();
    delete scenarios[id];

    this.writeScenarios(scenarios);

    // Clear current scenario if it was deleted
    if (this.getCurrentScenarioId() === id) {
      this.setCurrentScenarioId(null);
    }
  }

  // Duplicate a scenario (useful for templates)
  duplicateScenario(
    id: string,
    newName: string,
    includeResults = false
  ): SavedScenario {
    const originalScenario = this.getScenario(id);
    if (!originalScenario) {
      throw new Error(`Scenario with ID ${id} not found`);
    }

    const now = Date.now();
    const allScenarios = this.getAllScenarios();
    const allScenarioIds = new Set(Object.keys(allScenarios));
    const newScenarioId = this.generateGloballyUniqueId(allScenarioIds);
    const duplicatedScenario: SavedScenario = {
      id: newScenarioId,
      name: newName,
      scenario: JSON.parse(JSON.stringify(originalScenario.scenario)), // Deep clone
      attributeDefinitions: JSON.parse(JSON.stringify(originalScenario.attributeDefinitions)),
      results: includeResults
        ? JSON.parse(JSON.stringify(originalScenario.results))
        : [],
      createdAt: now,
      updatedAt: now,
      isTemplate: false, // Duplicates are not templates by default
    };

    // Generate new IDs for results if included
    if (includeResults) {
      const resultIds = new Set<string>();
      duplicatedScenario.results.forEach((result) => {
        let newResultId;
        do {
          newResultId = this.generateGloballyUniqueId(resultIds);
        } while (resultIds.has(newResultId));
        resultIds.add(newResultId);
        result.id = newResultId;
      });
    }

    this.saveScenario(duplicatedScenario);
    return duplicatedScenario;
  }

  // Create a new scenario from a specific result's saved configuration
  // and include only that result in the new scenario's history.
  restoreResultAsNewScenario(
    sourceScenarioId: string,
    resultId: string,
    newName?: string
  ): SavedScenario {
    const source = this.getScenario(sourceScenarioId);
    if (!source) {
      throw new Error(`Scenario with ID ${sourceScenarioId} not found`);
    }

    const result = source.results.find((r) => r.id === resultId);
    if (!result) {
      throw new Error(`Result with ID ${resultId} not found`);
    }

    const snapshot = result.scenarioSnapshot;
    if (!snapshot) {
      throw new Error(
        "This result does not have a saved scenario configuration (snapshot)"
      );
    }

    // Build a full Scenario from the snapshot and the solver settings used for this result
    const restoredScenario: Scenario = {
      people: snapshot.people,
      groups: snapshot.groups,
      num_sessions: snapshot.num_sessions,
      objectives: snapshot.objectives,
      constraints: snapshot.constraints,
      settings: result.solverSettings,
    } as Scenario;

    const defaultName = `${source.name} – ${
      result.name || "Result"
    } (restored)`;
    const created = this.createScenario(
      newName || defaultName,
      restoredScenario,
      source.attributeDefinitions,
    );

    // Clone the specific result into the new scenario, generating a fresh local ID
    const newResultId = this.generateGloballyUniqueId(new Set<string>());
    const clonedResult: ScenarioResult = {
      ...result,
      id: newResultId,
    };

    created.results.push(clonedResult);
    this.saveScenario(created);

    return created;
  }

  // Rename a scenario
  renameScenario(id: string, newName: string): void {
    const savedScenario = this.getScenario(id);
    if (!savedScenario) {
      throw new Error(`Scenario with ID ${id} not found`);
    }

    savedScenario.name = newName;
    this.saveScenario(savedScenario);
  }

  // Mark/unmark as template
  toggleTemplate(id: string): void {
    const savedScenario = this.getScenario(id);
    if (!savedScenario) {
      throw new Error(`Scenario with ID ${id} not found`);
    }

    savedScenario.isTemplate = !savedScenario.isTemplate;
    this.saveScenario(savedScenario);
  }

  // Current scenario management
  getCurrentScenarioId(): string | null {
    return localStorage.getItem(CURRENT_PROBLEM_KEY);
  }

  setCurrentScenarioId(id: string | null): void {
    if (id) {
      localStorage.setItem(CURRENT_PROBLEM_KEY, id);
    } else {
      localStorage.removeItem(CURRENT_PROBLEM_KEY);
    }
  }

  // Auto-save functionality
  private scheduleAutoSave(scenario: SavedScenario): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = window.setTimeout(() => {
      const latestPersistedScenario = this.getScenario(scenario.id);
      this.saveScenario(
        latestPersistedScenario
          ? {
              ...latestPersistedScenario,
              scenario: scenario.scenario,
            }
          : scenario,
      );
      this.autoSaveTimeout = null;
    }, this.autoSaveDelay);
  }

  // Export scenario to JSON
  exportScenario(id: string): ExportedScenario {
    const scenario = this.getScenario(id);
    if (!scenario) {
      throw new Error(`Scenario with ID ${id} not found`);
    }

    return {
      version: VERSION,
      scenario,
      exportedAt: Date.now(),
    };
  }

  // Import scenario from JSON
  importScenario(exportedData: ExportedScenario, newName?: string): SavedScenario {
    // Validate version compatibility
    if (exportedData.version !== VERSION) {
      console.warn(
        `Importing scenario with different version: ${exportedData.version} vs ${VERSION}`
      );
    }

    const now = Date.now();
    const allScenarios = this.getAllScenarios();
    const allScenarioIds = new Set(Object.keys(allScenarios));
    const newScenarioId = this.generateGloballyUniqueId(allScenarioIds);
    const importedScenario: SavedScenario = migrateSavedScenario({
      ...exportedData.scenario,
      id: newScenarioId, // New ID to avoid conflicts
      name: newName || `${exportedData.scenario.name} (Imported)`,
      attributeDefinitions:
        exportedData.scenario.attributeDefinitions ??
        exportedData.attributeDefinitions ??
        [],
      createdAt: now,
      updatedAt: now,
    });

    // Generate new IDs for all results to avoid conflicts (within this scenario)
    const resultIds = new Set<string>();
    importedScenario.results.forEach((result) => {
      let newResultId;
      do {
        newResultId = this.generateGloballyUniqueId(resultIds);
      } while (resultIds.has(newResultId));
      resultIds.add(newResultId);
      result.id = newResultId;
    });

    this.saveScenario(importedScenario);
    return importedScenario;
  }

  // Get storage usage info
  getStorageInfo(): { used: number; available: number; percentage: number } {
    const totalStorage = 5 * 1024 * 1024; // Approximate 5MB localStorage limit
    const used = new Blob([JSON.stringify(this.getAllScenarios())]).size;

    return {
      used,
      available: totalStorage - used,
      percentage: (used / totalStorage) * 100,
    };
  }

  // Clear all data (with confirmation)
  clearAllData(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CURRENT_PROBLEM_KEY);
  }

  // Migration utility: populate scenarioSnapshot for existing results
  // This uses the current scenario configuration as a fallback for old results
  // Note: This is not perfect since we don't know the exact configuration when old results were created
  migrateResultsAddScenarioSnapshot(scenarioId: string): void {
    const savedScenario = this.getScenario(scenarioId);
    if (!savedScenario) {
      throw new Error(`Scenario with ID ${scenarioId} not found`);
    }

    let hasChanges = false;

    // Add scenarioSnapshot to results that don't have it
    savedScenario.results.forEach((result) => {
      if (!result.scenarioSnapshot) {
        result.scenarioSnapshot = {
          people: savedScenario.scenario.people,
          groups: savedScenario.scenario.groups,
          num_sessions: savedScenario.scenario.num_sessions,
          objectives: savedScenario.scenario.objectives,
          constraints: savedScenario.scenario.constraints,
        };
        hasChanges = true;
      }
    });

    if (hasChanges) {
      this.saveScenario(savedScenario);
    }
  }

  // Migration utility: migrate all scenarios to add scenarioSnapshot to results
  migrateAllScenariosAddScenarioSnapshot(): void {
    const allScenarios = this.getAllScenarios();
    Object.keys(allScenarios).forEach((scenarioId) => {
      this.migrateResultsAddScenarioSnapshot(scenarioId);
    });
  }
}

// Export singleton instance
export const scenarioStorage = new ScenarioStorageService();
