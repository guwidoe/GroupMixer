import type {
  SavedProblem,
  Problem,
  ProblemResult,
  ProblemSummary,
  ProblemSnapshot,
  ExportedProblem,
  SolverSettings,
  Solution,
} from "../types";

const STORAGE_KEY = "people-distributor-problems";
const CURRENT_PROBLEM_KEY = "people-distributor-current-problem";
const VERSION = "1.0.0";

// Utility function to compare problem configurations
export interface ProblemConfigDifference {
  isDifferent: boolean;
  changes: {
    people?: boolean;
    groups?: boolean;
    num_sessions?: boolean;
    objectives?: boolean;
    constraints?: boolean;
  };
  details: {
    people?: string;
    groups?: string;
    num_sessions?: string;
    objectives?: string;
    constraints?: string;
  };
}

export function compareProblemConfigurations(
  current: Problem,
  snapshot: ProblemSnapshot | undefined
): ProblemConfigDifference {
  if (!snapshot) {
    return {
      isDifferent: true,
      changes: {},
      details: {
        people: "No configuration saved with this result",
        groups: "No configuration saved with this result",
        num_sessions: "No configuration saved with this result",
        objectives: "No configuration saved with this result",
        constraints: "No configuration saved with this result",
      },
    };
  }

  const changes: ProblemConfigDifference["changes"] = {};
  const details: ProblemConfigDifference["details"] = {};

  // Compare people
  if (JSON.stringify(current.people) !== JSON.stringify(snapshot.people)) {
    changes.people = true;
    details.people = `People configuration changed (${current.people.length} now vs ${snapshot.people.length} when result was created)`;
  }

  // Compare groups
  if (JSON.stringify(current.groups) !== JSON.stringify(snapshot.groups)) {
    changes.groups = true;
    details.groups = `Groups configuration changed (${current.groups.length} now vs ${snapshot.groups.length} when result was created)`;
  }

  // Compare num_sessions
  if (current.num_sessions !== snapshot.num_sessions) {
    changes.num_sessions = true;
    details.num_sessions = `Number of sessions changed (${current.num_sessions} now vs ${snapshot.num_sessions} when result was created)`;
  }

  // Compare objectives
  if (
    JSON.stringify(current.objectives) !== JSON.stringify(snapshot.objectives)
  ) {
    changes.objectives = true;
    details.objectives = "Objectives configuration changed";
  }

  // Compare constraints
  if (
    JSON.stringify(current.constraints) !== JSON.stringify(snapshot.constraints)
  ) {
    changes.constraints = true;
    details.constraints = `Constraints changed (${current.constraints.length} now vs ${snapshot.constraints.length} when result was created)`;
  }

  const isDifferent = Object.keys(changes).length > 0;

  return {
    isDifferent,
    changes,
    details,
  };
}

export class ProblemStorageService {
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

  // Get all saved problems
  getAllProblems(): Record<string, SavedProblem> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error("Failed to load problems from storage:", error);
      return {};
    }
  }

  // Get problem summaries for quick overview
  getProblemSummaries(): ProblemSummary[] {
    const problems = this.getAllProblems();
    return Object.values(problems).map((problem) => ({
      id: problem.id,
      name: problem.name,
      peopleCount: problem.problem.people.length,
      groupsCount: problem.problem.groups.length,
      sessionsCount: problem.problem.num_sessions,
      resultsCount: problem.results.length,
      createdAt: problem.createdAt,
      updatedAt: problem.updatedAt,
      isTemplate: problem.isTemplate,
    }));
  }

  // Get a specific problem
  getProblem(id: string): SavedProblem | null {
    const problems = this.getAllProblems();
    return problems[id] || null;
  }

  // Save or update a problem
  saveProblem(problem: SavedProblem): void {
    const problems = this.getAllProblems();
    problems[problem.id] = {
      ...problem,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(problems));
    } catch (error) {
      console.error("Failed to save problem to storage:", error);
      throw new Error(
        "Storage quota exceeded. Please delete some problems or export them to files."
      );
    }
  }

  // Create a new problem
  createProblem(
    name: string,
    problem: Problem,
    isTemplate = false
  ): SavedProblem {
    const now = Date.now();
    const allProblems = this.getAllProblems();
    const allProblemIds = new Set(Object.keys(allProblems));
    const id = this.generateGloballyUniqueId(allProblemIds);
    const savedProblem: SavedProblem = {
      id,
      name,
      problem,
      results: [],
      createdAt: now,
      updatedAt: now,
      isTemplate,
    };

    this.saveProblem(savedProblem);
    return savedProblem;
  }

  // Update problem definition (triggers auto-save)
  updateProblem(id: string, problem: Problem): void {
    const savedProblem = this.getProblem(id);
    if (!savedProblem) {
      throw new Error(`Problem with ID ${id} not found`);
    }

    savedProblem.problem = problem;
    this.scheduleAutoSave(savedProblem);
  }

  // Add a result to a problem
  addResult(
    problemId: string,
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string,
    currentProblemState?: Problem // Optional: pass current problem state to avoid stale data
  ): ProblemResult {
    const savedProblem = this.getProblem(problemId);
    if (!savedProblem) {
      throw new Error(`Problem with ID ${problemId} not found`);
    }
    // Collect all result IDs in the current problem
    const resultIds = new Set<string>(savedProblem.results.map((r) => r.id));
    const id = this.generateGloballyUniqueId(resultIds);

    // Use the current problem state if provided, otherwise fall back to saved state
    const problemToSnapshot = currentProblemState || savedProblem.problem;

    // Capture the current problem configuration as a snapshot
    const problemSnapshot = {
      people: problemToSnapshot.people,
      groups: problemToSnapshot.groups,
      num_sessions: problemToSnapshot.num_sessions,
      objectives: problemToSnapshot.objectives,
      constraints: problemToSnapshot.constraints,
    };

    const result: ProblemResult = {
      id,
      name: customName || `Result ${savedProblem.results.length + 1}`,
      solution,
      solverSettings,
      problemSnapshot,
      timestamp: Date.now(),
      duration: solution.elapsed_time_ms,
    };

    savedProblem.results.push(result);
    this.saveProblem(savedProblem);

    return result;
  }

  // Update result name
  updateResultName(problemId: string, resultId: string, newName: string): void {
    const savedProblem = this.getProblem(problemId);
    if (!savedProblem) {
      throw new Error(`Problem with ID ${problemId} not found`);
    }

    const result = savedProblem.results.find((r) => r.id === resultId);
    if (!result) {
      throw new Error(`Result with ID ${resultId} not found`);
    }

    result.name = newName;
    this.saveProblem(savedProblem);
  }

  // Delete a result
  deleteResult(problemId: string, resultId: string): void {
    const savedProblem = this.getProblem(problemId);
    if (!savedProblem) {
      throw new Error(`Problem with ID ${problemId} not found`);
    }

    savedProblem.results = savedProblem.results.filter(
      (r) => r.id !== resultId
    );
    this.saveProblem(savedProblem);
  }

  // Delete a problem
  deleteProblem(id: string): void {
    const problems = this.getAllProblems();
    delete problems[id];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(problems));
    } catch (error) {
      console.error("Failed to delete problem from storage:", error);
    }

    // Clear current problem if it was deleted
    if (this.getCurrentProblemId() === id) {
      this.setCurrentProblemId(null);
    }
  }

  // Duplicate a problem (useful for templates)
  duplicateProblem(
    id: string,
    newName: string,
    includeResults = false
  ): SavedProblem {
    const originalProblem = this.getProblem(id);
    if (!originalProblem) {
      throw new Error(`Problem with ID ${id} not found`);
    }

    const now = Date.now();
    const allProblems = this.getAllProblems();
    const allProblemIds = new Set(Object.keys(allProblems));
    const newProblemId = this.generateGloballyUniqueId(allProblemIds);
    const duplicatedProblem: SavedProblem = {
      id: newProblemId,
      name: newName,
      problem: JSON.parse(JSON.stringify(originalProblem.problem)), // Deep clone
      results: includeResults
        ? JSON.parse(JSON.stringify(originalProblem.results))
        : [],
      createdAt: now,
      updatedAt: now,
      isTemplate: false, // Duplicates are not templates by default
    };

    // Generate new IDs for results if included
    if (includeResults) {
      const resultIds = new Set<string>();
      duplicatedProblem.results.forEach((result) => {
        let newResultId;
        do {
          newResultId = this.generateGloballyUniqueId(resultIds);
        } while (resultIds.has(newResultId));
        resultIds.add(newResultId);
        result.id = newResultId;
      });
    }

    this.saveProblem(duplicatedProblem);
    return duplicatedProblem;
  }

  // Create a new problem from a specific result's saved configuration
  // and include only that result in the new problem's history.
  restoreResultAsNewProblem(
    sourceProblemId: string,
    resultId: string,
    newName?: string
  ): SavedProblem {
    const source = this.getProblem(sourceProblemId);
    if (!source) {
      throw new Error(`Problem with ID ${sourceProblemId} not found`);
    }

    const result = source.results.find((r) => r.id === resultId);
    if (!result) {
      throw new Error(`Result with ID ${resultId} not found`);
    }

    const snapshot = result.problemSnapshot;
    if (!snapshot) {
      throw new Error(
        "This result does not have a saved problem configuration (snapshot)"
      );
    }

    // Build a full Problem from the snapshot and the solver settings used for this result
    const restoredProblem: Problem = {
      people: snapshot.people,
      groups: snapshot.groups,
      num_sessions: snapshot.num_sessions,
      objectives: snapshot.objectives,
      constraints: snapshot.constraints,
      settings: result.solverSettings,
    } as Problem;

    const defaultName = `${source.name} – ${
      result.name || "Result"
    } (restored)`;
    const created = this.createProblem(newName || defaultName, restoredProblem);

    // Clone the specific result into the new problem, generating a fresh local ID
    const newResultId = this.generateGloballyUniqueId(new Set<string>());
    const clonedResult: ProblemResult = {
      ...result,
      id: newResultId,
    };

    created.results.push(clonedResult);
    this.saveProblem(created);

    return created;
  }

  // Rename a problem
  renameProblem(id: string, newName: string): void {
    const savedProblem = this.getProblem(id);
    if (!savedProblem) {
      throw new Error(`Problem with ID ${id} not found`);
    }

    savedProblem.name = newName;
    this.saveProblem(savedProblem);
  }

  // Mark/unmark as template
  toggleTemplate(id: string): void {
    const savedProblem = this.getProblem(id);
    if (!savedProblem) {
      throw new Error(`Problem with ID ${id} not found`);
    }

    savedProblem.isTemplate = !savedProblem.isTemplate;
    this.saveProblem(savedProblem);
  }

  // Current problem management
  getCurrentProblemId(): string | null {
    return localStorage.getItem(CURRENT_PROBLEM_KEY);
  }

  setCurrentProblemId(id: string | null): void {
    if (id) {
      localStorage.setItem(CURRENT_PROBLEM_KEY, id);
    } else {
      localStorage.removeItem(CURRENT_PROBLEM_KEY);
    }
  }

  // Auto-save functionality
  private scheduleAutoSave(problem: SavedProblem): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = window.setTimeout(() => {
      this.saveProblem(problem);
      this.autoSaveTimeout = null;
    }, this.autoSaveDelay);
  }

  // Export problem to JSON
  exportProblem(id: string): ExportedProblem {
    const problem = this.getProblem(id);
    if (!problem) {
      throw new Error(`Problem with ID ${id} not found`);
    }

    return {
      version: VERSION,
      problem,
      exportedAt: Date.now(),
    };
  }

  // Import problem from JSON
  importProblem(exportedData: ExportedProblem, newName?: string): SavedProblem {
    // Validate version compatibility
    if (exportedData.version !== VERSION) {
      console.warn(
        `Importing problem with different version: ${exportedData.version} vs ${VERSION}`
      );
    }

    const now = Date.now();
    const allProblems = this.getAllProblems();
    const allProblemIds = new Set(Object.keys(allProblems));
    const newProblemId = this.generateGloballyUniqueId(allProblemIds);
    const importedProblem: SavedProblem = {
      ...exportedData.problem,
      id: newProblemId, // New ID to avoid conflicts
      name: newName || `${exportedData.problem.name} (Imported)`,
      createdAt: now,
      updatedAt: now,
    };

    // Generate new IDs for all results to avoid conflicts (within this problem)
    const resultIds = new Set<string>();
    importedProblem.results.forEach((result) => {
      let newResultId;
      do {
        newResultId = this.generateGloballyUniqueId(resultIds);
      } while (resultIds.has(newResultId));
      resultIds.add(newResultId);
      result.id = newResultId;
    });

    this.saveProblem(importedProblem);
    return importedProblem;
  }

  // Get storage usage info
  getStorageInfo(): { used: number; available: number; percentage: number } {
    const totalStorage = 5 * 1024 * 1024; // Approximate 5MB localStorage limit
    const used = new Blob([JSON.stringify(this.getAllProblems())]).size;

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

  // Migration utility: populate problemSnapshot for existing results
  // This uses the current problem configuration as a fallback for old results
  // Note: This is not perfect since we don't know the exact configuration when old results were created
  migrateResultsAddProblemSnapshot(problemId: string): void {
    const savedProblem = this.getProblem(problemId);
    if (!savedProblem) {
      throw new Error(`Problem with ID ${problemId} not found`);
    }

    let hasChanges = false;

    // Add problemSnapshot to results that don't have it
    savedProblem.results.forEach((result) => {
      if (!result.problemSnapshot) {
        result.problemSnapshot = {
          people: savedProblem.problem.people,
          groups: savedProblem.problem.groups,
          num_sessions: savedProblem.problem.num_sessions,
          objectives: savedProblem.problem.objectives,
          constraints: savedProblem.problem.constraints,
        };
        hasChanges = true;
      }
    });

    if (hasChanges) {
      this.saveProblem(savedProblem);
    }
  }

  // Migration utility: migrate all problems to add problemSnapshot to results
  migrateAllProblemsAddProblemSnapshot(): void {
    const allProblems = this.getAllProblems();
    Object.keys(allProblems).forEach((problemId) => {
      this.migrateResultsAddProblemSnapshot(problemId);
    });
  }
}

// Export singleton instance
export const problemStorage = new ProblemStorageService();
