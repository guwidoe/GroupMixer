import { Scenario, SolverSettings, AttributeDefinition } from '../types';
import { createAttributeDefinition, getAttributeDefinitionName, resolveScenarioWorkspaceState } from './scenarioAttributes';
import { createDefaultSolverSettings, normalizeSolverFamilyId } from './solverUi';

export interface DemoCase {
  id: string;
  name: string;
  description: string;
  category: "Simple" | "Intermediate" | "Advanced" | "Benchmark";
  filename: string;
}

export interface DemoCaseWithMetrics extends DemoCase {
  peopleCount: number;
  groupCount: number;
  sessionCount: number;
  description: string;
}

// Dynamically discover test case files
// In a production environment, this would ideally be served by a backend endpoint
async function discoverTestCaseFiles(): Promise<string[]> {
  // Try to fetch a manifest file first (if it exists)
  try {
    const manifestResponse = await fetch("/test_cases/manifest.json");

    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      return manifest.files;
    } else {
      console.warn(
        `Manifest fetch failed with status: ${manifestResponse.status} ${manifestResponse.statusText}`
      );
    }
  } catch (error) {
    console.error("Error fetching manifest:", error);
  }

  // If manifest doesn't exist, return empty list
  return [];
}

// Convert test case format to webapp's Scenario format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertTestCaseToScenario(testCase: any): Scenario {
  const input = testCase.input;
  const scenarioInput = input.scenario ?? input.problem;

  if (!scenarioInput) {
    throw new Error('Demo case is missing scenario/problem input data');
  }

  const settings = convertDemoSolverSettings(input.solver);

  const scenario: Scenario = {
    people: scenarioInput.people,
    groups: scenarioInput.groups,
    num_sessions: scenarioInput.num_sessions,
    constraints: input.constraints || [],
    settings,
  };
  return resolveScenarioWorkspaceState(scenario).scenario;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertDemoSolverSettings(rawSolver: any): SolverSettings {
  const familyId = normalizeSolverFamilyId(rawSolver?.solver_type) ?? 'solver1';

  switch (familyId) {
    case 'solver3':
      return {
        ...createDefaultSolverSettings('solver3'),
        solver_type: 'solver3',
        stop_conditions: rawSolver?.stop_conditions ?? createDefaultSolverSettings('solver3').stop_conditions,
        solver_params: {
          solver_type: 'solver3',
          correctness_lane: rawSolver?.solver_params?.correctness_lane
            ?? rawSolver?.solver_params?.solver3?.correctness_lane
            ?? createDefaultSolverSettings('solver3').solver_params.correctness_lane,
        },
        logging: rawSolver?.logging ?? createDefaultSolverSettings('solver3').logging,
      };
    case 'solver1':
    default: {
      const solverParams = rawSolver?.solver_params ?? {};
      return {
        ...createDefaultSolverSettings('solver1'),
        solver_type: rawSolver?.solver_type ?? 'SimulatedAnnealing',
        stop_conditions: rawSolver?.stop_conditions ?? createDefaultSolverSettings('solver1').stop_conditions,
        solver_params: {
          SimulatedAnnealing: {
            initial_temperature: solverParams.initial_temperature ?? 1.0,
            final_temperature: solverParams.final_temperature ?? 0.01,
            cooling_schedule: solverParams.cooling_schedule ?? 'geometric',
            reheat_cycles: solverParams.reheat_cycles ?? 0,
            reheat_after_no_improvement: solverParams.reheat_after_no_improvement ?? 0,
          },
        },
        logging: rawSolver?.logging ?? createDefaultSolverSettings('solver1').logging,
      };
    }
  }
}

// Load and parse a single test case file
async function loadTestCaseFile(
  filename: string
): Promise<DemoCaseWithMetrics | null> {
  try {
    const response = await fetch(`/test_cases/${filename}`);

    if (!response.ok) {
      console.warn(
        `Failed to load test case file: ${filename} - ${response.status} ${response.statusText}`
      );
      return null;
    }

    const testCase = await response.json();

    // Check if this test case has demo metadata
    if (!testCase.demo_metadata) {
      return null; // Skip files without demo metadata
    }

    const metadata = testCase.demo_metadata;
    const scenario = testCase.input?.scenario ?? testCase.input?.problem;

    if (!scenario) {
      console.warn(`Skipping demo case without scenario/problem input: ${filename}`);
      return null;
    }

    const demoCase = {
      id: metadata.id,
      name: metadata.display_name,
      description: metadata.description,
      category: metadata.category,
      filename: filename,
      peopleCount: scenario.people?.length || 0,
      groupCount: scenario.groups?.length || 0,
      sessionCount: scenario.num_sessions || 0,
    };

    return demoCase;
  } catch (error) {
    console.error(`Error loading test case file ${filename}:`, error);
    return null;
  }
}

// Load all demo cases with metrics from test case files
export async function loadDemoCasesWithMetrics(): Promise<
  DemoCaseWithMetrics[]
> {
  // First discover all available test case files
  const testCaseFiles = await discoverTestCaseFiles();

  const loadPromises = testCaseFiles.map((filename) =>
    loadTestCaseFile(filename)
  );
  const results = await Promise.all(loadPromises);

  // Filter out null results (files without demo metadata or that failed to load)
  const demoCases = results.filter(
    (result): result is DemoCaseWithMetrics => result !== null
  );

  // Sort by category and then by name
  const categoryOrder: Record<string, number> = {
    Simple: 1,
    Intermediate: 2,
    Advanced: 3,
    Benchmark: 4,
  };
  demoCases.sort((a, b) => {
    const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
    if (categoryDiff !== 0) return categoryDiff;
    return a.name.localeCompare(b.name);
  });

  return demoCases;
}

// Load a specific demo case by ID
export async function loadDemoCase(demoCaseId: string): Promise<Scenario> {
  // First, load all demo cases to find the one with matching ID
  const demoCases = await loadDemoCasesWithMetrics();
  const demoCase = demoCases.find((c) => c.id === demoCaseId);

  if (!demoCase) {
    throw new Error(`Demo case not found: ${demoCaseId}`);
  }

  try {
    const response = await fetch(`/test_cases/${demoCase.filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load demo case: ${response.statusText}`);
    }

    const testCase = await response.json();
    return convertTestCaseToScenario(testCase);
  } catch (error) {
    console.error(`Error loading demo case ${demoCase.name}:`, error);

    // Fallback to the current demo data if loading fails
    if (demoCaseId === "ui-demo") {
      return createFallbackDemo();
    }

    throw error;
  }
}

// Fallback demo data (current implementation)
function createFallbackDemo(): Scenario {
  const demoGroups = [
    { id: "team-alpha", size: 4 },
    { id: "team-beta", size: 4 },
    { id: "team-gamma", size: 4 },
  ];

  const demoPeople = [
    {
      id: "alice",
      attributes: {
        name: "Alice Johnson",
        gender: "female",
        department: "engineering",
        seniority: "senior",
      },
    },
    {
      id: "bob",
      attributes: {
        name: "Bob Smith",
        gender: "male",
        department: "marketing",
        seniority: "mid",
      },
    },
    {
      id: "charlie",
      attributes: {
        name: "Charlie Brown",
        gender: "male",
        department: "engineering",
        seniority: "junior",
      },
    },
    {
      id: "diana",
      attributes: {
        name: "Diana Prince",
        gender: "female",
        department: "sales",
        seniority: "lead",
      },
    },
    {
      id: "eve",
      attributes: {
        name: "Eve Davis",
        gender: "female",
        department: "hr",
        seniority: "mid",
      },
    },
    {
      id: "frank",
      attributes: {
        name: "Frank Miller",
        gender: "male",
        department: "finance",
        seniority: "senior",
      },
    },
    {
      id: "grace",
      attributes: {
        name: "Grace Lee",
        gender: "female",
        department: "engineering",
        seniority: "junior",
      },
    },
    {
      id: "henry",
      attributes: {
        name: "Henry Wilson",
        gender: "male",
        department: "marketing",
        seniority: "senior",
      },
    },
    {
      id: "iris",
      attributes: {
        name: "Iris Chen",
        gender: "female",
        department: "sales",
        seniority: "mid",
      },
    },
    {
      id: "jack",
      attributes: {
        name: "Jack Taylor",
        gender: "male",
        department: "hr",
        seniority: "junior",
      },
    },
    {
      id: "kate",
      attributes: {
        name: "Kate Anderson",
        gender: "female",
        department: "finance",
        seniority: "lead",
      },
    },
    {
      id: "leo",
      attributes: {
        name: "Leo Rodriguez",
        gender: "male",
        department: "engineering",
        seniority: "mid",
      },
      sessions: [1, 2], // Late arrival - misses first session
    },
  ];

  const scenario: Scenario = {
    people: demoPeople as unknown as Scenario['people'],
    groups: demoGroups,
    num_sessions: 3,
    constraints: [
      // Limit repeat encounters
      {
        type: "RepeatEncounter",
        max_allowed_encounters: 1,
        penalty_function: "squared",
        penalty_weight: 10.0,
      },
      // Keep Alice and Bob together (they're project partners)
      {
        type: "MustStayTogether",
        people: ["alice", "bob"],
        penalty_weight: 10.0,
        sessions: [0, 1], // Only for first two sessions
      },
      // Charlie and Diana can't be together (personality conflict)
      {
        type: "ShouldNotBeTogether",
        people: ["charlie", "diana"],
        penalty_weight: 10.0,
      },
      // Maintain gender balance in team-alpha
      {
        type: "AttributeBalance",
        group_id: "team-alpha",
        attribute_key: "gender",
        desired_values: { male: 2, female: 2 },
        penalty_weight: 10.0,
        mode: "exact",
      },
    ],
    settings: {
      ...createDefaultSolverSettings(),
      stop_conditions: {
        ...createDefaultSolverSettings().stop_conditions,
        no_improvement_iterations: 1000,
      },
    },
  };
  return resolveScenarioWorkspaceState(scenario).scenario;
}

// Extract all unique attributes and their values from a Scenario
export function extractAttributesFromScenario(
  scenario: Scenario
): AttributeDefinition[] {
  const attributeMap = new Map<string, Set<string>>();

  // Extract attributes from all people
  scenario.people.forEach((person) => {
    Object.entries(person.attributes).forEach(([key, value]) => {
      if (!attributeMap.has(key)) {
        attributeMap.set(key, new Set());
      }
      attributeMap.get(key)!.add(String(value));
    });
  });

  // Convert to AttributeDefinition array
  const extractedAttributes: AttributeDefinition[] = [];
  attributeMap.forEach((values, key) => {
    extractedAttributes.push(createAttributeDefinition(key, Array.from(values).sort()));
  });

  return extractedAttributes.sort((left, right) => getAttributeDefinitionName(left).localeCompare(getAttributeDefinitionName(right)));
}

// Merge extracted attributes with existing definitions
export function mergeAttributeDefinitions(
  existing: AttributeDefinition[],
  extracted: AttributeDefinition[]
): AttributeDefinition[] {
  const merged = new Map<string, { id?: string; values: Set<string> }>();

  // Add all existing attributes
  existing.forEach((def) => {
    const name = getAttributeDefinitionName(def);
    merged.set(name, { id: def.id, values: new Set(def.values) });
  });

  // Merge in extracted attributes
  extracted.forEach((def) => {
    const name = getAttributeDefinitionName(def);
    if (merged.has(name)) {
      // Add new values to existing attribute
      def.values.forEach((value) => {
        merged.get(name)!.values.add(value);
      });
    } else {
      // Add new attribute
      merged.set(name, { id: def.id, values: new Set(def.values) });
    }
  });

  // Convert back to AttributeDefinition array
  const result: AttributeDefinition[] = [];
  merged.forEach(({ id, values }, key) => {
    result.push(createAttributeDefinition(key, Array.from(values).sort(), id));
  });

  // Sort by key name for consistent ordering
  return result.sort((a, b) => getAttributeDefinitionName(a).localeCompare(getAttributeDefinitionName(b)));
}
