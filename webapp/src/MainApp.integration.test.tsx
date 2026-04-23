import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import MainApp from "./MainApp";
import { SolverWorkspace } from "./components/SolverWorkspace/SolverWorkspace";
import { ResultsView } from "./components/ResultsView";
import { ResultsHistory } from "./components/ResultsHistory";
import { scenarioStorage } from "./services/scenarioStorage";
import { setRuntimeForTests, type SolverRuntime } from "./services/runtime";
import { useAppStore } from "./store";
import { createSampleScenario, createSampleSolverSettings, createSavedScenario } from "./test/fixtures";

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
    listSolvers: vi.fn(async () => ({
      solvers: [
        {
          kind: 'solver1',
          canonical_id: 'solver1',
          display_name: 'Solver 1',
          accepted_config_ids: ['solver1', 'legacy_simulated_annealing', 'simulated_annealing', 'SimulatedAnnealing'],
          capabilities: {
            supports_initial_schedule: true,
            supports_progress_callback: true,
            supports_benchmark_observer: true,
            supports_recommended_settings: true,
            supports_deterministic_seed: true,
          },
          notes: 'Solver 1 notes',
        },
        {
          kind: 'solver3',
          canonical_id: 'solver3',
          display_name: 'Solver 3',
          accepted_config_ids: ['solver3'],
          capabilities: {
            supports_initial_schedule: true,
            supports_progress_callback: true,
            supports_benchmark_observer: true,
            supports_recommended_settings: true,
            supports_deterministic_seed: true,
          },
          notes: 'Solver 3 notes',
        },
      ],
    })),
    getSolverDescriptor: vi.fn(async (solverId: string) => ({
      kind: solverId,
      canonical_id: solverId,
      display_name: solverId === 'solver3' ? 'Solver 3' : 'Solver 1',
      accepted_config_ids: solverId === 'solver3' ? ['solver3'] : ['solver1', 'legacy_simulated_annealing', 'simulated_annealing', 'SimulatedAnnealing'],
      capabilities: {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: true,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
      },
      notes: `${solverId} notes`,
    })),
    getDefaultSolverSettings: vi.fn(async () => createSampleSolverSettings()),
    validateScenario: vi.fn(async () => ({ valid: true, issues: [] })),
    recommendSettings: vi.fn(async () => createSampleSolverSettings()),
    solveWithProgress: vi.fn(async ({ scenario }) => ({
      selectedSettings: scenario.settings,
      runScenario: scenario,
      solution: createSavedScenario().results[0].solution,
      lastProgress: null,
    })),
    solveWarmStart: vi.fn(async ({ scenario }) => ({
      selectedSettings: scenario.settings,
      runScenario: scenario,
      solution: createSavedScenario().results[0].solution,
      lastProgress: null,
    })),
    evaluateSolution: vi.fn(async () => createSavedScenario().results[0].solution),
    cancel: vi.fn(async () => undefined),
    getActiveSolveSnapshot: vi.fn(() => null),
    hasActiveSolveSnapshot: vi.fn(() => false),
    ...overrides,
  };
}

vi.mock("./visualizations/VisualizationPanel", () => ({
  VisualizationPanel: () => <div>Visualization panel test stub</div>,
}));

vi.mock("./hooks", async () => {
  const React = await import("react");
  return {
    useLocalStorageState: (_key: string, initialValue: string) => React.useState(initialValue),
    useOutsideClick: () => {},
  };
});

function renderAppRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/app" element={<MainApp />}>
          <Route path="solver" element={<Navigate to="/app/solver/run" replace />} />
          <Route path="solver/:section" element={<SolverWorkspace />} />
          <Route path="results" element={<ResultsView />} />
          <Route path="history" element={<ResultsHistory />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function getPrimaryRunSolverButton() {
  return screen.getByTitle(/recommended solver configuration automatically/i);
}

describe("MainApp stateful integration routes", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.__groupmixerLandingEvents = [];
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    useAppStore.setState({
      initializeApp: vi.fn(),
      loadSavedScenarios: vi.fn(),
    });

    setRuntimeForTests(createRuntimeMock());
  });

  afterEach(() => {
    setRuntimeForTests(null);
  });

  it("tracks app entry attribution from URL params on first app load", async () => {
    renderAppRoute("/app/solver?lp=random-team-generator&exp=seo-hero-test&var=B");

    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app_entry',
          payload: expect.objectContaining({
            entryPath: '/app/solver',
            landingSlug: 'random-team-generator',
            experiment: 'seo-hero-test',
            variant: 'B',
          }),
        }),
      ]),
    );
  });

  it("marks app routes as noindex and suppresses landing structured data", async () => {
    renderAppRoute('/app/solver');

    expect(document.title).toBe('Solver Workspace | GroupMixer App');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,nofollow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://www.groupmixer.app/app/solver/run',
    );
    expect(document.getElementById('groupmixer-route-schema')?.textContent ?? '').toBe('');
  });

  it("renders the real solver workspace with warm-start history and auto-set success", async () => {
    const user = userEvent.setup();
    const savedScenario = createSavedScenario({
      id: "scenario-1",
      name: "Workshop Plan",
      scenario: createSampleScenario({ settings: createSampleSolverSettings() }),
    });
    const recommendedSettings = {
      ...createSampleSolverSettings(),
      stop_conditions: {
        max_iterations: 777,
        time_limit_seconds: 3,
        no_improvement_iterations: 111,
      },
      solver_params: {
        SimulatedAnnealing: {
          ...createSampleSolverSettings().solver_params.SimulatedAnnealing,
          reheat_cycles: 2,
        },
      },
    };
    const runtime = createRuntimeMock({
      recommendSettings: vi.fn(async () => recommendedSettings),
    });
    setRuntimeForTests(runtime);
    scenarioStorage.saveScenario(savedScenario);

    useAppStore.setState({
      scenario: savedScenario.scenario,
      currentScenarioId: savedScenario.id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });

    renderAppRoute("/app/solver");

    expect(await screen.findByRole("heading", { name: /run solver/i })).toBeInTheDocument();
    expect(getPrimaryRunSolverButton()).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /^solver 1$/i }));
    expect(await screen.findByRole("heading", { name: /^solver 1$/i, level: 1 })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /start from random \(default\)/i }));
    await user.click(screen.getByRole("button", { name: /baseline/i }));
    expect(screen.getByRole("button", { name: /baseline • score 12.50/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /auto-set/i }));

    expect(runtime.recommendSettings).toHaveBeenCalledWith(expect.objectContaining({
      desiredRuntimeSeconds: 3,
      scenario: expect.objectContaining({
        groups: savedScenario.scenario.groups,
        num_sessions: savedScenario.scenario.num_sessions,
        objectives: savedScenario.scenario.objectives,
      }),
    }));
    await waitFor(() => {
      expect(useAppStore.getState().scenario?.settings).toEqual(recommendedSettings);
    });
  }, 10000);

  it("surfaces auto-set failures through the real /app/solver notification path", async () => {
    const user = userEvent.setup();
    const savedScenario = createSavedScenario({
      id: "scenario-1",
      scenario: createSampleScenario(),
    });
    const runtime = createRuntimeMock({
      recommendSettings: vi.fn(async () => {
        throw new Error("recommend failed");
      }),
    });
    setRuntimeForTests(runtime);

    useAppStore.setState({
      scenario: savedScenario.scenario,
      currentScenarioId: savedScenario.id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });

    renderAppRoute("/app/solver");

    await user.click(screen.getByRole('button', { name: /^solver 1$/i }));
    await user.click(screen.getByRole("button", { name: /auto-set/i }));

    expect(await screen.findByText(/auto-set failed/i)).toBeInTheDocument();
    expect(screen.getByText(/recommend failed/i)).toBeInTheDocument();
  }, 10000);

  it("updates solver settings in scratchpad mode when switching to solver3", async () => {
    const user = userEvent.setup();
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });

    useAppStore.setState({
      scenario,
      currentScenarioId: null,
      savedScenarios: {},
    });

    renderAppRoute('/app/solver');

    await user.click(await screen.findByRole('button', { name: /^solver 3$/i }));

    await waitFor(() => {
      expect(useAppStore.getState().scenario?.settings.solver_type).toBe('solver3');
    });

    expect(useAppStore.getState().scenario?.settings.solver_params).not.toHaveProperty('SimulatedAnnealing');

    expect(screen.getByText(/recommended settings/i)).toBeInTheDocument();
    expect(screen.getByText(/solver 3: dense-state search/i)).toBeInTheDocument();
    expect(screen.getByText(/enable correctness lane/i)).toBeInTheDocument();
  });

  it('persists scratchpad solver results by creating a saved scenario on completion', async () => {
    const user = userEvent.setup();
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
    const runtime = createRuntimeMock();
    setRuntimeForTests(runtime);

    useAppStore.setState({
      scenario,
      currentScenarioId: null,
      savedScenarios: {},
    });

    renderAppRoute('/app/solver');

    await user.click(await screen.findByTitle(/recommended solver configuration automatically/i));

    await waitFor(() => {
      expect(useAppStore.getState().currentScenarioId).not.toBeNull();
    });

    const storeState = useAppStore.getState();
    const createdScenarioId = storeState.currentScenarioId as string;
    expect(storeState.savedScenarios[createdScenarioId]).toBeDefined();
    expect(storeState.savedScenarios[createdScenarioId].results).toHaveLength(1);
  });

  it('surfaces runtime catalog discovery errors instead of falling back to a local selector catalog', async () => {
    const runtime = createRuntimeMock({
      listSolvers: vi.fn(async () => {
        throw new Error('catalog boom');
      }),
    });
    setRuntimeForTests(runtime);

    useAppStore.setState({
      scenario: createSampleScenario({ settings: createSampleSolverSettings() }),
      currentScenarioId: null,
      savedScenarios: {},
    });

    renderAppRoute('/app/solver');

    expect(await screen.findAllByText(/available solvers unavailable/i)).not.toHaveLength(0);
    expect(screen.getAllByText(/catalog boom/i)).not.toHaveLength(0);
  });

  it("renders the real /app/results surface with a saved solution already in state", async () => {
    const savedScenario = createSavedScenario({
      id: "scenario-1",
      scenario: createSampleScenario(),
    });

    useAppStore.setState({
      scenario: savedScenario.scenario,
      solution: savedScenario.results[0].solution,
      currentScenarioId: savedScenario.id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });

    renderAppRoute("/app/results");

    expect(await screen.findByRole("heading", { name: /optimization results/i })).toBeInTheDocument();
    expect(screen.getByText(/assignment layout/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saved results/i })).toBeInTheDocument();
  });

  it('opens saved results from the current result header', async () => {
    const user = userEvent.setup();
    const savedScenario = createSavedScenario({
      id: 'scenario-1',
      scenario: createSampleScenario(),
    });

    useAppStore.setState({
      scenario: savedScenario.scenario,
      solution: savedScenario.results[0].solution,
      currentScenarioId: savedScenario.id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });

    renderAppRoute('/app/results');

    await user.click(await screen.findByRole('button', { name: /saved results/i }));

    expect(await screen.findByRole('heading', { name: /saved results/i })).toBeInTheDocument();
  });

  it("renders the real /app/history surface and can navigate into result details from persisted state", async () => {
    const user = userEvent.setup();
    const savedScenario = createSavedScenario({
      id: "scenario-1",
      scenario: createSampleScenario(),
    });

    useAppStore.setState({
      scenario: savedScenario.scenario,
      solution: savedScenario.results[0].solution,
      currentScenarioId: savedScenario.id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });

    renderAppRoute("/app/history");

    expect(await screen.findByRole("heading", { name: /saved results/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open current result/i }));

    expect(await screen.findByRole("heading", { name: /optimization results/i })).toBeInTheDocument();
  });

  it('opens the current result directly from the solver page after a completed run', async () => {
    const user = userEvent.setup();
    const savedScenario = createSavedScenario({
      id: 'scenario-1',
      scenario: createSampleScenario({ settings: createSampleSolverSettings() }),
    });

    useAppStore.setState({
      scenario: savedScenario.scenario,
      solution: savedScenario.results[0].solution,
      solverState: {
        isRunning: false,
        isComplete: true,
        currentIteration: savedScenario.results[0].solution.iteration_count,
        bestScore: savedScenario.results[0].solution.final_score,
        currentScore: savedScenario.results[0].solution.final_score,
        elapsedTime: savedScenario.results[0].solution.elapsed_time_ms,
        noImprovementCount: 0,
      },
      currentScenarioId: savedScenario.id,
      currentResultId: savedScenario.results[0].id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });

    renderAppRoute('/app/solver/run');

    const openButtons = await screen.findAllByRole('button', { name: /open current result/i });
    expect(openButtons.length).toBeGreaterThan(0);

    await user.click(openButtons[0]);

    expect(await screen.findByRole('heading', { name: /optimization results/i })).toBeInTheDocument();
  });

  it("updates progress targets immediately when automatic settings choose a larger run budget", async () => {
    const user = userEvent.setup();
    const savedScenario = createSavedScenario({
      id: "scenario-1",
      scenario: createSampleScenario({ settings: createSampleSolverSettings() }),
    });
    const deferred = createDeferred<{
      selectedSettings: ReturnType<typeof createSampleSolverSettings>;
      runScenario: ReturnType<typeof createSavedScenario>["scenario"];
      solution: ReturnType<typeof createSavedScenario>["results"][number]["solution"];
      lastProgress: null;
    }>();
    const recommendedSettings = {
      ...createSampleSolverSettings(),
      stop_conditions: {
        max_iterations: 486486,
        time_limit_seconds: 2,
        no_improvement_iterations: 243243,
      },
    };

    const runtime = createRuntimeMock({
      recommendSettings: vi.fn(async () => recommendedSettings),
      solveWithProgress: vi.fn(() => deferred.promise),
    });
    setRuntimeForTests(runtime);

    useAppStore.setState({
      scenario: savedScenario.scenario,
      currentScenarioId: savedScenario.id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });

    renderAppRoute("/app/solver");

    await user.click(await screen.findByTitle(/recommended solver configuration automatically/i));

    expect(await screen.findByText("0 / 486,486")).toBeInTheDocument();
    expect(screen.getByText("0.0s / 2s")).toBeInTheDocument();
    expect(screen.getByText("0 / 243,243")).toBeInTheDocument();

    deferred.resolve({
      selectedSettings: recommendedSettings,
      runScenario: {
        ...savedScenario.scenario,
        settings: recommendedSettings,
      },
      solution: savedScenario.results[0].solution,
      lastProgress: null,
    });
  });
});
