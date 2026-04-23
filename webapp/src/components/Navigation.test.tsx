import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useLocation } from "react-router-dom";
import { Navigation } from "./Navigation";
import { renderWithRouter } from "../test/utils";

let mockPastStatesCount = 0;
let mockFutureStatesCount = 0;
const mockUndoScenarioDocument = vi.fn();
const mockRedoScenarioDocument = vi.fn();

const mockStoreState = {
  manualEditorUnsaved: false,
  manualEditorLeaveHook: null as null | ((nextPath: string) => void),
  setupGridUnsaved: false,
  setupGridLeaveHook: null as null | ((continueAction: () => void) => void),
  undoScenarioDocument: mockUndoScenarioDocument,
  redoScenarioDocument: mockRedoScenarioDocument,
  ui: {
    advancedModeEnabled: true,
    lastScenarioSetupSection: 'people',
  },
};

vi.mock("../store", () => ({
  useAppStore: Object.assign(
    vi.fn((selector?: (state: typeof mockStoreState) => unknown) => (selector ? selector(mockStoreState) : mockStoreState)),
    {
      getState: () => mockStoreState,
    },
  ),
  useScenarioDocumentHistory: (selector: (state: { pastStates: unknown[]; futureStates: unknown[] }) => unknown) => selector({
    pastStates: Array.from({ length: mockPastStatesCount }),
    futureStates: Array.from({ length: mockFutureStatesCount }),
  }),
}));

vi.mock('./SolverWorkspace/useSolverWorkspaceRunController', () => ({
  useSolverWorkspaceRunController: () => ({
    scenario: { people: [], groups: [], num_sessions: 3, constraints: [], settings: { solver_type: 'solver1', stop_conditions: {}, solver_params: {} } },
    solverState: { isRunning: false },
    handleStartSolver: vi.fn(async () => undefined),
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe("Navigation", () => {
  beforeEach(() => {
    mockStoreState.manualEditorUnsaved = false;
    mockStoreState.manualEditorLeaveHook = null;
    mockStoreState.setupGridUnsaved = false;
    mockStoreState.setupGridLeaveHook = null;
    mockStoreState.ui.advancedModeEnabled = true;
    mockStoreState.ui.lastScenarioSetupSection = 'people';
    mockPastStatesCount = 0;
    mockFutureStatesCount = 0;
    mockUndoScenarioDocument.mockReset();
    mockRedoScenarioDocument.mockReset();
  });

  it("renders primary navigation tabs as sticky app chrome and allows normal navigation", async () => {
    const user = userEvent.setup();

    const { container } = renderWithRouter(
      <>
        <Navigation />
        <LocationProbe />
      </>,
      { route: "/app/scenario" }
    );

    expect(screen.getByRole("link", { name: /setup/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /solver/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /results/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /manual editor/i })).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass('sticky');

    await user.click(screen.getByRole("link", { name: /solver/i }));
    expect(screen.getByTestId("location")).toHaveTextContent("/app/solver");
  });

  it('hides solver and editor tabs in standard mode', () => {
    mockStoreState.ui.advancedModeEnabled = false;

    renderWithRouter(
      <>
        <Navigation />
        <LocationProbe />
      </>,
      { route: '/app/scenario' },
    );

    expect(screen.getByRole('link', { name: /setup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate groups/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /results/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /solver/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /manual editor/i })).not.toBeInTheDocument();
  });

  it('keeps the manual editor route out of the workflow bar', () => {
    renderWithRouter(
      <Navigation />,
      { route: '/app/editor' },
    );

    expect(screen.getByRole('link', { name: /results/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /manual editor/i })).not.toBeInTheDocument();
  });

  it("uses the leave hook instead of navigating away from the manual editor when there are unsaved changes", async () => {
    const user = userEvent.setup();
    const leaveHook = vi.fn();
    mockStoreState.manualEditorUnsaved = true;
    mockStoreState.manualEditorLeaveHook = leaveHook;

    renderWithRouter(
      <>
        <Navigation />
        <LocationProbe />
      </>,
      { route: "/app/editor" }
    );

    await user.click(screen.getByRole("link", { name: /solver/i }));

    expect(leaveHook).toHaveBeenCalledWith("/app/solver");
    expect(screen.getByTestId("location")).toHaveTextContent("/app/editor");
  });

  it("returns to the last visited setup section when switching back to setup", async () => {
    const user = userEvent.setup();
    mockStoreState.ui.lastScenarioSetupSection = 'groups';

    renderWithRouter(
      <>
        <Navigation />
        <LocationProbe />
      </>,
      { route: "/app/solver" }
    );

    await user.click(screen.getByRole("link", { name: /setup/i }));

    expect(screen.getByTestId("location")).toHaveTextContent("/app/scenario/groups");
  });

  it('shows compact scenario history controls next to the workflow rail on setup routes', () => {
    mockPastStatesCount = 1;
    mockFutureStatesCount = 1;

    renderWithRouter(
      <Navigation variant="embedded" />,
      { route: '/app/scenario/people' },
    );

    expect(screen.getByRole('button', { name: /undo scenario setup change/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /redo scenario setup change/i })).toBeEnabled();
  });

  it('invokes scenario history handlers from the compact workflow controls', async () => {
    const user = userEvent.setup();
    mockPastStatesCount = 1;
    mockFutureStatesCount = 1;

    renderWithRouter(
      <Navigation variant="embedded" />,
      { route: '/app/scenario/people' },
    );

    await user.click(screen.getByRole('button', { name: /undo scenario setup change/i }));
    await user.click(screen.getByRole('button', { name: /redo scenario setup change/i }));

    expect(mockUndoScenarioDocument).toHaveBeenCalledTimes(1);
    expect(mockRedoScenarioDocument).toHaveBeenCalledTimes(1);
  });

  it('uses the setup-grid leave hook instead of navigating away from setup when there are unapplied grid changes', async () => {
    const user = userEvent.setup();
    const leaveHook = vi.fn();
    mockStoreState.setupGridUnsaved = true;
    mockStoreState.setupGridLeaveHook = leaveHook;

    renderWithRouter(
      <>
        <Navigation />
        <LocationProbe />
      </>,
      { route: '/app/scenario/people' },
    );

    await user.click(screen.getByRole('link', { name: /solver/i }));

    expect(leaveHook).toHaveBeenCalledTimes(1);
    expect(typeof leaveHook.mock.calls[0]?.[0]).toBe('function');
    expect(screen.getByTestId('location')).toHaveTextContent('/app/scenario/people');
  });
});
