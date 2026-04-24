/* eslint-disable react/no-multi-comp */
import { Outlet } from "react-router-dom";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { renderWithRouter } from "./test/utils";
import { useAppStore } from "./store";

vi.mock("./pages/ToolLandingPage", () => ({
  default: ({ pageKey, locale }: { pageKey: string; locale: string }) => (
    <div>Tool landing test stub: {locale}:{pageKey}</div>
  ),
}));

vi.mock("./MainApp", () => ({
  default: () => (
    <div>
      <div>Main app shell</div>
      <Outlet />
    </div>
  ),
}));

vi.mock("./components/ScenarioEditor/ScenarioEditor", () => ({
  ScenarioEditor: () => <div>Scenario editor test stub</div>,
}));

vi.mock("./components/SolverWorkspace/SolverWorkspace", () => ({
  SolverWorkspace: () => <div>Solver workspace test stub</div>,
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
  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.getState().setAdvancedModeEnabled(false);
  });

  it("renders the tool-first landing page on the root route", async () => {
    renderWithRouter(<App />, { route: "/" });

    expect(
      await screen.findByText("Tool landing test stub: en:home")
    ).toBeInTheDocument();
  });

  it("redirects /landingpage back to the root tool route", async () => {
    renderWithRouter(<App />, { route: "/landingpage" });

    expect(
      await screen.findByText("Tool landing test stub: en:home")
    ).toBeInTheDocument();
  });

  it("registers localized home routes on the shared landing shell", async () => {
    renderWithRouter(<App />, { route: "/es" });

    expect(
      await screen.findByText("Tool landing test stub: es:home")
    ).toBeInTheDocument();
  });

  it("registers Simplified Chinese home route on the shared landing shell", async () => {
    renderWithRouter(<App />, { route: "/zh" });

    expect(
      await screen.findByText("Tool landing test stub: zh:home")
    ).toBeInTheDocument();
  });

  it("registers German home route on the shared landing shell", async () => {
    renderWithRouter(<App />, { route: "/de" });

    expect(
      await screen.findByText("Tool landing test stub: de:home")
    ).toBeInTheDocument();
  });

  it("renders nested /app routes inside the main shell", async () => {
    renderWithRouter(<App />, { route: "/app/scenario/people" });

    expect(await screen.findByText("Main app shell")).toBeInTheDocument();
    expect(
      await screen.findByText("Scenario editor test stub")
    ).toBeInTheDocument();
  });

  it("supports first-class scenario setup subroutes like attributes", async () => {
    renderWithRouter(<App />, { route: "/app/scenario/attributes" });

    expect(await screen.findByText("Main app shell")).toBeInTheDocument();
    expect(
      await screen.findByText("Scenario editor test stub")
    ).toBeInTheDocument();
  });

  it("redirects /app/solver to the default run workspace", async () => {
    useAppStore.getState().setAdvancedModeEnabled(true);

    renderWithRouter(<App />, { route: "/app/solver" });

    expect(await screen.findByText("Main app shell")).toBeInTheDocument();
    expect(await screen.findByText("Solver workspace test stub")).toBeInTheDocument();
  });

  it('redirects /app/solver back into the basic workflow when advanced mode is disabled', async () => {
    renderWithRouter(<App />, { route: '/app/solver' });

    expect(await screen.findByText('Main app shell')).toBeInTheDocument();
    expect(await screen.findByText('Scenario editor test stub')).toBeInTheDocument();
  });
});
