/* eslint-disable react/no-multi-comp */
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResultsSchedule } from "./ResultsSchedule";
import { createSampleProblem, createSampleSolution } from "../../test/fixtures";

vi.mock("./ResultsScheduleGrid", () => ({
  ResultsScheduleGrid: ({ sessionData }: { sessionData: Array<{ sessionIndex: number }> }) => (
    <div>grid view ({sessionData.length})</div>
  ),
}));

vi.mock("./ResultsScheduleList", () => ({
  ResultsScheduleList: ({ effectiveProblem }: { effectiveProblem: { people: Array<unknown> } }) => (
    <div>list view ({effectiveProblem.people.length})</div>
  ),
}));

vi.mock("./ResultsScheduleVisualization", () => ({
  ResultsScheduleVisualization: ({ vizPluginId }: { vizPluginId: string }) => (
    <div>visualize view ({vizPluginId})</div>
  ),
}));

const effectiveProblem = createSampleProblem();
const solution = createSampleSolution();
const sessionData = [
  {
    sessionIndex: 0,
    totalPeople: 4,
    groups: [
      {
        id: "g1",
        size: 2,
        people: effectiveProblem.people.slice(0, 2),
      },
    ],
  },
];

describe("ResultsSchedule", () => {
  it("renders the selected child view", () => {
    const { rerender } = render(
      <ResultsSchedule
        viewMode="grid"
        onViewModeChange={vi.fn()}
        sessionData={sessionData}
        effectiveProblem={effectiveProblem}
        solution={solution}
        vizPluginId="contact-graph"
        onVizPluginChange={vi.fn()}
        vizExportRef={createRef<HTMLDivElement>()}
      />
    );

    expect(screen.getByText("grid view (1)")).toBeInTheDocument();

    rerender(
      <ResultsSchedule
        viewMode="list"
        onViewModeChange={vi.fn()}
        sessionData={sessionData}
        effectiveProblem={effectiveProblem}
        solution={solution}
        vizPluginId="contact-graph"
        onVizPluginChange={vi.fn()}
        vizExportRef={createRef<HTMLDivElement>()}
      />
    );
    expect(screen.getByText("list view (4)")).toBeInTheDocument();

    rerender(
      <ResultsSchedule
        viewMode="visualize"
        onViewModeChange={vi.fn()}
        sessionData={sessionData}
        effectiveProblem={effectiveProblem}
        solution={solution}
        vizPluginId="contact-graph"
        onVizPluginChange={vi.fn()}
        vizExportRef={createRef<HTMLDivElement>()}
      />
    );
    expect(screen.getByText("visualize view (contact-graph)")).toBeInTheDocument();
  });

  it("calls view mode change handlers from the toolbar", async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();

    render(
      <ResultsSchedule
        viewMode="grid"
        onViewModeChange={onViewModeChange}
        sessionData={sessionData}
        effectiveProblem={effectiveProblem}
        solution={solution}
        vizPluginId="contact-graph"
        onVizPluginChange={vi.fn()}
        vizExportRef={createRef<HTMLDivElement>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /list/i }));
    await user.click(screen.getByRole("button", { name: /visualize/i }));
    await user.click(screen.getByRole("button", { name: /grid/i }));

    expect(onViewModeChange).toHaveBeenNthCalledWith(1, "list");
    expect(onViewModeChange).toHaveBeenNthCalledWith(2, "visualize");
    expect(onViewModeChange).toHaveBeenNthCalledWith(3, "grid");
  });
});
