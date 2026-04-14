import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResultsExportDropdown } from './ResultsExportDropdown';

describe('ResultsExportDropdown', () => {
  it('groups export actions by intent and triggers callbacks', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onExportAction = vi.fn();
    const onCopyAction = vi.fn();
    const onPrintResult = vi.fn();
    const onExportVisualizationPng = vi.fn();

    render(
      <ResultsExportDropdown
        isOpen
        onToggle={onToggle}
        onExportAction={onExportAction}
        onCopyAction={onCopyAction}
        onPrintResult={onPrintResult}
        onExportVisualizationPng={onExportVisualizationPng}
        viewMode="visualize"
        dropdownRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.getByRole('button', { name: /share & export/i })).toBeInTheDocument();
    expect(screen.getByText(/quick use/i)).toBeInTheDocument();
    expect(screen.getByText(/structured files/i)).toBeInTheDocument();
    expect(screen.getByText(/audience-ready downloads/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy schedule table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print current result/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save current view as png/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download session rosters/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /share & export/i }));
    await user.click(screen.getByRole('button', { name: /copy participant itineraries/i }));
    await user.click(screen.getByRole('button', { name: /print current result/i }));
    await user.click(screen.getByRole('button', { name: /save current view as png/i }));
    await user.click(screen.getByRole('button', { name: /download result snapshot/i }));
    await user.click(screen.getByRole('button', { name: /download spreadsheet-ready schedule/i }));
    await user.click(screen.getByRole('button', { name: /download session rosters/i }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onCopyAction).toHaveBeenCalledWith('copy-participant-itineraries');
    expect(onPrintResult).toHaveBeenCalledTimes(1);
    expect(onExportVisualizationPng).toHaveBeenCalledTimes(1);
    expect(onExportAction).toHaveBeenNthCalledWith(1, 'json-result-bundle');
    expect(onExportAction).toHaveBeenNthCalledWith(2, 'excel-full-schedule');
    expect(onExportAction).toHaveBeenNthCalledWith(3, 'csv-session-rosters');
  });

  it('hides visualization-only quick actions outside visualization mode', () => {
    render(
      <ResultsExportDropdown
        isOpen
        onToggle={vi.fn()}
        onExportAction={vi.fn()}
        onCopyAction={vi.fn()}
        onPrintResult={vi.fn()}
        onExportVisualizationPng={vi.fn()}
        viewMode="grid"
        dropdownRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.queryByRole('button', { name: /save current view as png/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy schedule table/i })).toBeInTheDocument();
  });
});
