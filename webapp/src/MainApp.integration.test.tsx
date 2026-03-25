import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MainApp from "./MainApp";
import { SolverPanel } from "./components/SolverPanel";
import { ResultsView } from "./components/ResultsView";
import { ResultsHistory } from "./components/ResultsHistory";
import { useAppStore } from "./store";
import { createSampleProblem, createSampleSolverSettings, createSavedProblem } from "./test/fixtures";
import { solverWorkerService } from "./services/solverWorker";

vi.mock("./services/solverWorker", () => ({
  solverWorkerService: {
    getRecommendedSettings: vi.fn(),
    cancel: vi.fn(),
  },
}));

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
          <Route path="solver" element={<SolverPanel />} />
          <Route path="results" element={<ResultsView />} />
          <Route path="history" element={<ResultsHistory />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("MainApp stateful integration routes", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    useAppStore.setState({
      initializeApp: vi.fn(),
      loadSavedProblems: vi.fn(),
    });
  });

  it("renders the real /app/solver surface with loaded state, warm-start history, and auto-set success", async () => {
    const user = userEvent.setup();
    const savedProblem = createSavedProblem({
      id: "problem-1",
      name: "Workshop Plan",
      problem: createSampleProblem({ settings: createSampleSolverSettings() }),
    });
    vi.mocked(solverWorkerService.getRecommendedSettings).mockResolvedValue(
      createSampleSolverSettings(),
    );

    useAppStore.setState({
      problem: savedProblem.problem,
      currentProblemId: savedProblem.id,
      savedProblems: { [savedProblem.id]: savedProblem },
    });

    renderAppRoute("/app/solver");

    expect(await screen.findByRole("heading", { name: /^solver$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start solver with automatic settings/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /solve with custom settings/i }));
    expect(await screen.findByRole("heading", { name: /manual solver configuration/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /start from random \(default\)/i }));
    await user.click(screen.getByRole("button", { name: /baseline/i }));
    expect(screen.getByRole("button", { name: /baseline • score 12.50/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /auto-set/i }));

    expect(solverWorkerService.getRecommendedSettings).toHaveBeenCalledWith(savedProblem.problem, 3);
    expect(await screen.findByText(/settings updated/i)).toBeInTheDocument();
  });

  it("surfaces auto-set failures through the real /app/solver notification path", async () => {
    const user = userEvent.setup();
    const savedProblem = createSavedProblem({
      id: "problem-1",
      problem: createSampleProblem(),
    });
    vi.mocked(solverWorkerService.getRecommendedSettings).mockRejectedValue(
      new Error("recommend failed"),
    );

    useAppStore.setState({
      problem: savedProblem.problem,
      currentProblemId: savedProblem.id,
      savedProblems: { [savedProblem.id]: savedProblem },
    });

    renderAppRoute("/app/solver");

    await user.click(screen.getByRole("button", { name: /solve with custom settings/i }));
    await user.click(screen.getByRole("button", { name: /auto-set/i }));

    expect(await screen.findByText(/auto-set failed/i)).toBeInTheDocument();
    expect(screen.getByText(/recommend failed/i)).toBeInTheDocument();
  });

  it("renders the real /app/results surface with a saved solution already in state", async () => {
    const savedProblem = createSavedProblem({
      id: "problem-1",
      problem: createSampleProblem(),
    });

    useAppStore.setState({
      problem: savedProblem.problem,
      solution: savedProblem.results[0].solution,
      currentProblemId: savedProblem.id,
      savedProblems: { [savedProblem.id]: savedProblem },
    });

    renderAppRoute("/app/results");

    expect(await screen.findByRole("heading", { name: /optimization results/i })).toBeInTheDocument();
    expect(screen.getByText(/group assignments/i)).toBeInTheDocument();
  });

  it("renders the real /app/history surface and can navigate into result details from persisted state", async () => {
    const user = userEvent.setup();
    const savedProblem = createSavedProblem({
      id: "problem-1",
      problem: createSampleProblem(),
    });

    useAppStore.setState({
      problem: savedProblem.problem,
      solution: savedProblem.results[0].solution,
      currentProblemId: savedProblem.id,
      savedProblems: { [savedProblem.id]: savedProblem },
    });

    renderAppRoute("/app/history");

    expect(await screen.findByRole("heading", { name: /results history/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /view in result details/i }));

    expect(await screen.findByRole("heading", { name: /optimization results/i })).toBeInTheDocument();
  });
});
