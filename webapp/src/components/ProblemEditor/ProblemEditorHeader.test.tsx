import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProblemEditorHeader } from "./ProblemEditorHeader";

vi.mock("./DemoDataDropdown", () => ({
  DemoDataDropdown: ({ onDemoCaseClick }: { onDemoCaseClick: (id: string, name: string) => void }) => (
    <button onClick={() => onDemoCaseClick("demo-1", "Demo One")}>Demo data</button>
  ),
}));

describe("ProblemEditorHeader", () => {
  it("renders actions and forwards button clicks", async () => {
    const user = userEvent.setup();
    const onLoadProblem = vi.fn();
    const onSaveProblem = vi.fn();
    const onDemoCaseClick = vi.fn();

    render(
      <ProblemEditorHeader
        onLoadProblem={onLoadProblem}
        onSaveProblem={onSaveProblem}
        onDemoCaseClick={onDemoCaseClick}
      />
    );

    await user.click(screen.getByRole("button", { name: /load/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));
    await user.click(screen.getByRole("button", { name: /demo data/i }));

    expect(onLoadProblem).toHaveBeenCalledTimes(1);
    expect(onSaveProblem).toHaveBeenCalledTimes(1);
    expect(onDemoCaseClick).toHaveBeenCalledWith("demo-1", "Demo One");
  });
});
