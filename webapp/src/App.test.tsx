/* eslint-disable react/no-multi-comp */
import { Outlet } from "react-router-dom";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { renderWithRouter } from "./test/utils";

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

  it("renders SEO entry routes with the shared tool shell", async () => {
    renderWithRouter(<App />, { route: "/random-team-generator" });

    expect(
      await screen.findByText("Tool landing test stub: en:random-team-generator")
    ).toBeInTheDocument();
  });

  it("renders additional intent routes with the same shared shell", async () => {
    renderWithRouter(<App />, { route: "/speed-networking-generator" });

    expect(
      await screen.findByText("Tool landing test stub: en:speed-networking-generator")
    ).toBeInTheDocument();
  });

  it("registers newly added English rollout routes with the shared landing shell", async () => {
    renderWithRouter(<App />, { route: "/random-pair-generator" });

    expect(
      await screen.findByText("Tool landing test stub: en:random-pair-generator")
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
