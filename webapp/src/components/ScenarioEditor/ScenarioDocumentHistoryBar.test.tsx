import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioDocumentHistoryBar } from './ScenarioDocumentHistoryBar';

describe('ScenarioDocumentHistoryBar', () => {
  it('disables undo/redo controls when history is unavailable', () => {
    render(
      <ScenarioDocumentHistoryBar
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /undo scenario setup change/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo scenario setup change/i })).toBeDisabled();
  });

  it('invokes handlers when undo/redo controls are enabled', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();

    render(
      <ScenarioDocumentHistoryBar
        canUndo
        canRedo
        onUndo={onUndo}
        onRedo={onRedo}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /undo scenario setup change/i }));
    fireEvent.click(screen.getByRole('button', { name: /redo scenario setup change/i }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });
});
