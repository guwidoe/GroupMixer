import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateScenarioDialog } from "./CreateScenarioDialog";

describe("CreateScenarioDialog", () => {
  it("does not render when closed", () => {
    render(
      <CreateScenarioDialog
        open={false}
        mode="empty"
        newScenarioName=""
        setNewScenarioName={vi.fn()}
        newScenarioIsTemplate={false}
        setNewScenarioIsTemplate={vi.fn()}
        onCreate={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByText(/create new scenario/i)).not.toBeInTheDocument();
  });

  it("supports editing, toggling template mode, and guarded create/cancel actions", async () => {
    const user = userEvent.setup();
    const setNewScenarioName = vi.fn();
    const setNewScenarioIsTemplate = vi.fn();
    const onCreate = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <CreateScenarioDialog
        open
        mode="duplicate"
        newScenarioName=""
        setNewScenarioName={setNewScenarioName}
        newScenarioIsTemplate={false}
        setNewScenarioIsTemplate={setNewScenarioIsTemplate}
        onCreate={onCreate}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole("heading", { name: /duplicate current scenario/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/enter scenario name/i), "Fresh copy");
    expect(setNewScenarioName).toHaveBeenCalled();

    await user.click(screen.getByLabelText(/save as template/i));
    expect(setNewScenarioIsTemplate).toHaveBeenCalledWith(true);

    rerender(
      <CreateScenarioDialog
        open
        mode="duplicate"
        newScenarioName="Fresh copy"
        setNewScenarioName={setNewScenarioName}
        newScenarioIsTemplate={true}
        setNewScenarioIsTemplate={setNewScenarioIsTemplate}
        onCreate={onCreate}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: /^create$/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
