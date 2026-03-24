/* eslint-disable react/no-multi-comp */
import { Outlet } from "react-router-dom";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { renderWithRouter } from "./test/utils";

vi.mock("./components/LandingPage", () => ({
  default: () => <div>Landing page test stub</div>,
}));

vi.mock("./MainApp", () => ({
  default: () => (
    <div>
      <div>Main app shell</div>
      <Outlet />
    </div>
  ),
}));

vi.mock("./components/ProblemEditor/ProblemEditor", () => ({
  ProblemEditor: () => <div>Problem editor test stub</div>,
}));

vi.mock("./components/SolverPanel", () => ({
  SolverPanel: () => <div>Solver panel test stub</div>,
}));

vi.mock("./components/ResultsView", () => ({
  ResultsView: () => <div>Results view test stub</div>,
}));

vi.mock("./components/ResultsHistory", () => ({
  ResultsHistory: () => <div>Results history test stub</div>,
}));

vi.mock("./components/ManualEditor", () => ({
  ManualEditor: () => <div>Manual editor test stub</div>,
}));

describe("App routing", () => {
  it("redirects the root route to the landing page", async () => {
    renderWithRouter(<App />, { route: "/" });

    expect(
      await screen.findByText("Landing page test stub")
    ).toBeInTheDocument();
  });

  it("renders nested /app routes inside the main shell", async () => {
    renderWithRouter(<App />, { route: "/app/problem/people" });

    expect(await screen.findByText("Main app shell")).toBeInTheDocument();
    expect(
      await screen.findByText("Problem editor test stub")
    ).toBeInTheDocument();
  });
});
