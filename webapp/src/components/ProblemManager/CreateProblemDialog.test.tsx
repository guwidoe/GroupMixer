import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateProblemDialog } from "./CreateProblemDialog";

describe("CreateProblemDialog", () => {
  it("does not render when closed", () => {
    render(
      <CreateProblemDialog
        open={false}
        mode="empty"
        newProblemName=""
        setNewProblemName={vi.fn()}
        newProblemIsTemplate={false}
        setNewProblemIsTemplate={vi.fn()}
        onCreate={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByText(/create new problem/i)).not.toBeInTheDocument();
  });

  it("supports editing, toggling template mode, and guarded create/cancel actions", async () => {
    const user = userEvent.setup();
    const setNewProblemName = vi.fn();
    const setNewProblemIsTemplate = vi.fn();
    const onCreate = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <CreateProblemDialog
        open
        mode="duplicate"
        newProblemName=""
        setNewProblemName={setNewProblemName}
        newProblemIsTemplate={false}
        setNewProblemIsTemplate={setNewProblemIsTemplate}
        onCreate={onCreate}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole("heading", { name: /duplicate current problem/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/enter problem name/i), "Fresh copy");
    expect(setNewProblemName).toHaveBeenCalled();

    await user.click(screen.getByLabelText(/save as template/i));
    expect(setNewProblemIsTemplate).toHaveBeenCalledWith(true);

    rerender(
      <CreateProblemDialog
        open
        mode="duplicate"
        newProblemName="Fresh copy"
        setNewProblemName={setNewProblemName}
        newProblemIsTemplate={true}
        setNewProblemIsTemplate={setNewProblemIsTemplate}
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
