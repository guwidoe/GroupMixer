import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResultsHeader } from "./ResultsHeader";
import { createSampleSolution } from "../../test/fixtures";
import type { ProblemConfigDifference } from "../../services/problemStorage";

const configDiff: ProblemConfigDifference = {
  isDifferent: true,
  changes: { people: true },
  details: { people: "People configuration changed" },
};

describe("ResultsHeader", () => {
  it("renders key result summary information", () => {
    render(
      <ResultsHeader
        resultName="Baseline"
        solution={createSampleSolution({ final_score: 12.5, iteration_count: 42, elapsed_time_ms: 1234 })}
        configDiff={null}
        configDetailsOpen={false}
        onToggleConfigDetails={vi.fn()}
        onRestoreConfig={vi.fn()}
        exportDropdownOpen={false}
        onToggleExportDropdown={vi.fn()}
        onExportResult={vi.fn()}
        onExportVisualizationPng={vi.fn()}
        viewMode="grid"
        exportDropdownRef={createRef<HTMLDivElement>()}
        configDetailsRef={createRef<HTMLDivElement>()}
      />
    );

    expect(screen.getByRole("heading", { name: /optimization results - baseline/i })).toBeInTheDocument();
    expect(screen.getByText(/12\.50/)).toBeInTheDocument();
    expect(screen.getByText(/42 iterations/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.23s/i)).toBeInTheDocument();
    expect(screen.queryByText(/different config/i)).not.toBeInTheDocument();
  });

  it("exposes config difference and export actions", async () => {
    const user = userEvent.setup();
    const onToggleConfigDetails = vi.fn();
    const onRestoreConfig = vi.fn();
    const onToggleExportDropdown = vi.fn();
    const onExportResult = vi.fn();
    const onExportVisualizationPng = vi.fn();

    render(
      <ResultsHeader
        resultName="Scenario A"
        solution={createSampleSolution()}
        configDiff={configDiff}
        configDetailsOpen={true}
        onToggleConfigDetails={onToggleConfigDetails}
        onRestoreConfig={onRestoreConfig}
        exportDropdownOpen={true}
        onToggleExportDropdown={onToggleExportDropdown}
        onExportResult={onExportResult}
        onExportVisualizationPng={onExportVisualizationPng}
        viewMode="visualize"
        exportDropdownRef={createRef<HTMLDivElement>()}
        configDetailsRef={createRef<HTMLDivElement>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /different config/i }));
    await user.click(screen.getByRole("button", { name: /restore this result's configuration as new problem/i }));
    await user.click(screen.getByRole("button", { name: /^export$/i }));
    await user.click(screen.getByRole("button", { name: /export viz as png/i }));
    await user.click(screen.getByRole("button", { name: /export as csv/i }));

    expect(screen.getByText(/people configuration changed/i)).toBeInTheDocument();
    expect(onToggleConfigDetails).toHaveBeenCalledTimes(1);
    expect(onRestoreConfig).toHaveBeenCalledTimes(1);
    expect(onToggleExportDropdown).toHaveBeenCalledTimes(1);
    expect(onExportVisualizationPng).toHaveBeenCalledTimes(1);
    expect(onExportResult).toHaveBeenCalledWith("csv");
  });
});
