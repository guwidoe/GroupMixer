/* eslint-disable react/no-multi-comp */
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResultsSchedule } from "./ResultsSchedule";
import { createSampleScenario, createSampleSolution } from "../../test/fixtures";

vi.mock("./ResultsScheduleGrid", () => ({
  ResultsScheduleGrid: ({ sessionData, selectedSessionIndex }: { sessionData: Array<{ sessionIndex: number }>; selectedSessionIndex?: number | null }) => (
    <div>grid view ({sessionData.length}) / selected:{selectedSessionIndex ?? 'all'}</div>
  ),
}));

vi.mock("./ResultsScheduleList", () => ({
  ResultsScheduleList: ({ participants }: { participants: Array<unknown> }) => (
    <div>list view ({participants.length})</div>
  ),
}));

vi.mock("./ResultsScheduleVisualization", () => ({
  ResultsScheduleVisualization: ({ vizPluginId }: { vizPluginId: string }) => (
    <div>visualize view ({vizPluginId})</div>
  ),
}));

const effectiveScenario = createSampleScenario();
const solution = createSampleSolution();
const sessionData = [
  {
    sessionIndex: 0,
    label: 'Session 1',
    totalPeople: 4,
    totalCapacity: 4,
    openSeats: 0,
    groups: [
      {
        id: "g1",
        size: 2,
        assignedCount: 2,
        openSeats: 0,
        fillRatio: 1,
        people: effectiveScenario.people.slice(0, 2),
      },
    ],
  },
  {
    sessionIndex: 1,
    label: 'Session 2',
    totalPeople: 4,
    totalCapacity: 4,
    openSeats: 0,
    groups: [
      {
        id: "g1",
        size: 2,
        assignedCount: 2,
        openSeats: 0,
        fillRatio: 1,
        people: effectiveScenario.people.slice(2),
      },
    ],
  },
];

const resultsModel = {
  summary: {
    totalPeople: effectiveScenario.people.length,
    totalGroups: effectiveScenario.groups.length,
    totalSessions: effectiveScenario.num_sessions,
    totalAssignments: solution.assignments.length,
    totalCapacity: 4,
    openSeats: 0,
    averageFillPercent: 100,
  },
  sessions: sessionData,
  participants: effectiveScenario.people.map((person) => ({
    personId: person.id,
    displayName: person.name,
    person,
    assignedSessions: 2,
    unassignedSessions: 0,
    sessions: Array.from({ length: effectiveScenario.num_sessions }, (_, sessionIndex) => ({
      sessionIndex,
      sessionLabel: `Session ${sessionIndex + 1}`,
      groupId: 'g1',
      groupSize: 2,
      isAssigned: true,
    })),
  })),
};

describe("ResultsSchedule", () => {
  it("renders the selected child view", () => {
    const { rerender } = render(
      <ResultsSchedule
        viewMode="grid"
        onViewModeChange={vi.fn()}
        resultsModel={resultsModel}
        effectiveScenario={effectiveScenario}
        solution={solution}
        vizPluginId="contact-graph"
        onVizPluginChange={vi.fn()}
        vizExportRef={createRef<HTMLDivElement>()}
      />
    );

    expect(screen.getByText("grid view (2) / selected:all")).toBeInTheDocument();

    rerender(
      <ResultsSchedule
        viewMode="list"
        onViewModeChange={vi.fn()}
        resultsModel={resultsModel}
        effectiveScenario={effectiveScenario}
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
        resultsModel={resultsModel}
        effectiveScenario={effectiveScenario}
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
        resultsModel={resultsModel}
        effectiveScenario={effectiveScenario}
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

  it("lets users focus the grid on a single session via filter chips", async () => {
    const user = userEvent.setup();

    render(
      <ResultsSchedule
        viewMode="grid"
        onViewModeChange={vi.fn()}
        resultsModel={resultsModel}
        effectiveScenario={effectiveScenario}
        solution={solution}
        vizPluginId="contact-graph"
        onVizPluginChange={vi.fn()}
        vizExportRef={createRef<HTMLDivElement>()}
      />
    );

    expect(screen.getByRole('button', { name: /all sessions/i })).toBeInTheDocument();
    expect(screen.getByText('grid view (2) / selected:all')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /session 2/i }));
    expect(screen.getByText('grid view (2) / selected:1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /all sessions/i }));
    expect(screen.getByText('grid view (2) / selected:all')).toBeInTheDocument();
  });
});
