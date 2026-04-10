import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useLocation } from "react-router-dom";
import { Navigation } from "./Navigation";
import { renderWithRouter } from "../test/utils";

const mockStoreState = {
  manualEditorUnsaved: false,
  manualEditorLeaveHook: null as null | ((nextPath: string) => void),
  ui: {
    lastScenarioSetupSection: 'people',
  },
};

vi.mock("../store", () => ({
  useAppStore: vi.fn((selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState)),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe("Navigation", () => {
  beforeEach(() => {
    mockStoreState.manualEditorUnsaved = false;
    mockStoreState.manualEditorLeaveHook = null;
    mockStoreState.ui.lastScenarioSetupSection = 'people';
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
    expect(screen.getByRole("link", { name: /manual editor/i })).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('sticky');

    await user.click(screen.getByRole("link", { name: /solver/i }));
    expect(screen.getByTestId("location")).toHaveTextContent("/app/solver");
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
});
