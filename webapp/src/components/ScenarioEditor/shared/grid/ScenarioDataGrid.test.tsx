import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioDataGrid } from './ScenarioDataGrid';
import { createOptionalSessionScopeColumn } from './sessionScopeColumn';
import type { ScenarioDataGridWorkspaceMode } from './types';
import { createJsonRawCodec, validateStringNumberRecordValue } from './model/rawCodec';

const rows = [
  { id: 'a', name: 'Beta', weight: 20 },
  { id: 'b', name: 'Alpha', weight: 10 },
];

describe('ScenarioDataGrid', () => {
  it('sorts rows when sortable headers are clicked', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
          },
          {
            id: 'weight',
            header: 'Weight',
            cell: (row) => row.weight,
            sortValue: (row) => row.weight,
            searchValue: (row) => String(row.weight),
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /name/i }));

    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(within(bodyRows[0]!).getByText('Alpha')).toBeInTheDocument();
    expect(within(bodyRows[1]!).getByText('Beta')).toBeInTheDocument();
  });

  it('does not render the obsolete global search box', () => {
    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
          },
        ]}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /search table/i })).not.toBeInTheDocument();
  });

  it('shows filtered counts inside the filters bar instead of the toolbar', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
            filter: {
              type: 'text',
              ariaLabel: 'Filter names',
            },
          },
        ]}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /search table/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open filter for name/i }));
    await user.type(screen.getByRole('textbox', { name: /filter names/i }), 'alpha{enter}');

    expect(screen.getByText(/showing 1\/2 rows/i)).toBeInTheDocument();
  });

  it('supports icon-triggered header text tokens and range filters', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
            filter: {
              type: 'text',
              ariaLabel: 'Filter names',
            },
          },
          {
            id: 'weight',
            header: 'Weight',
            cell: (row) => row.weight,
            sortValue: (row) => row.weight,
            searchValue: (row) => String(row.weight),
            filter: {
              type: 'numberRange',
              ariaLabel: 'Filter weight',
              getValue: (row) => row.weight,
            },
          },
        ]}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /filter names/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open filter for name/i }));
    await user.type(screen.getByRole('textbox', { name: /filter names/i }), 'alpha{enter}');

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /name: alpha/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /name: alpha/i }));
    await user.click(screen.getByRole('button', { name: /open filter for weight/i }));
    await user.type(screen.getByRole('spinbutton', { name: /filter weight minimum/i }), '15');

    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('opens browse rows on click while ignoring inline row actions', async () => {
    const user = userEvent.setup();
    const onRowOpen = vi.fn();
    const onDelete = vi.fn();

    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        onRowOpen={onRowOpen}
        rowOpenLabel={(row) => `Edit ${row.name}`}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
          },
          {
            kind: 'display',
            id: 'actions',
            header: 'Actions',
            cell: (row) => <button type="button" aria-label={`Delete ${row.name}`} onClick={() => onDelete(row.id)}>Delete</button>,
          },
        ]}
      />,
    );

    const betaRow = screen.getByRole('row', { name: /edit beta/i });
    const betaNameCell = screen.getByText('Beta').closest('td');
    expect(betaNameCell).toHaveStyle({ backgroundColor: 'var(--bg-primary)' });

    fireEvent.mouseEnter(betaRow);
    expect(betaNameCell).toHaveStyle({ backgroundColor: 'var(--bg-tertiary)' });

    await user.click(screen.getByText('Beta'));
    expect(onRowOpen).toHaveBeenCalledWith(rows[0]);

    await user.click(screen.getByRole('button', { name: /delete beta/i }));
    expect(onDelete).toHaveBeenCalledWith('a');
    expect(onRowOpen).toHaveBeenCalledTimes(1);
  });

  it('supports multi-select column filtering from the header popover', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioDataGrid
        rows={[
          { id: 'a', name: 'Alex', team: 'Blue' },
          { id: 'b', name: 'Bea', team: 'Red' },
          { id: 'c', name: 'Casey', team: 'Green' },
        ]}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
          },
          {
            id: 'team',
            header: 'Team',
            cell: (row) => row.team,
            sortValue: (row) => row.team,
            searchValue: (row) => row.team,
            filter: {
              type: 'select',
              ariaLabel: 'Filter team options',
              options: [
                { value: 'Blue', label: 'Blue' },
                { value: 'Red', label: 'Red' },
                { value: 'Green', label: 'Green' },
              ],
            },
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /open filter for team/i }));
    await user.click(screen.getByRole('checkbox', { name: /add blue filter/i }));
    await user.click(screen.getByRole('checkbox', { name: /add red filter/i }));

    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Bea')).toBeInTheDocument();
    expect(screen.queryByText('Casey')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /team: blue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /team: red/i })).toBeInTheDocument();
  });

  it('renders filter popovers in a viewport layer instead of inside the scroller', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
            filter: {
              type: 'text',
              ariaLabel: 'Filter names',
            },
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /open filter for name/i }));

    const filterInput = screen.getByRole('textbox', { name: /filter names/i });
    const scroller = document.querySelector('.overflow-auto');
    expect(scroller).not.toContainElement(filterInput);
    expect(document.body).toContainElement(filterInput);
  });

  it('keeps long headers readable with truncation tooltips and a stronger minimum width', () => {
    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'very-long',
            header: 'Very Long Column Header Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
            filter: {
              type: 'text',
              ariaLabel: 'Filter very long header values',
            },
            width: 90,
          },
        ]}
      />,
    );

    expect(screen.getByTitle('Very Long Column Header Name')).toBeInTheDocument();

    const col = document.querySelector('col');
    expect(col).not.toBeNull();
    expect(Number.parseInt((col as HTMLTableColElement).style.width, 10)).toBeGreaterThan(90);
  });

  it('toggles column visibility from the shared columns menu', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
          },
          {
            id: 'weight',
            header: 'Weight',
            cell: (row) => row.weight,
            sortValue: (row) => row.weight,
            searchValue: (row) => String(row.weight),
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /columns/i }));
    await user.click(screen.getByRole('checkbox', { name: /weight/i }));

    expect(screen.queryByRole('columnheader', { name: /weight/i })).not.toBeInTheDocument();
    expect(screen.queryByText('20')).not.toBeInTheDocument();
  });

  it('resizes columns through the shared resize handle', () => {
    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
            width: 180,
          },
        ]}
      />,
    );

    const col = document.querySelector('col');
    expect(col).not.toBeNull();
    expect(col).toHaveStyle({ width: '180px' });

    const separator = screen.getByRole('separator', { name: /resize name column/i });
    fireEvent.pointerDown(separator, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 140 });
    fireEvent.pointerUp(window);

    expect(col).toHaveStyle({ width: '220px' });
  });

  it('supports inline editing through the shared edit mode', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
            editor: {
              type: 'text',
              getValue: (row) => row.name,
              onCommit,
              ariaLabel: (row) => `Edit ${row.name}`,
            },
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit table/i }));
    const input = screen.getByRole('textbox', { name: /edit beta/i });
    await user.clear(input);
    await user.type(input, 'Beta Prime');
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith(rows[0], 'Beta Prime');
  });

  it('opens a CSV preview for the current filtered rows and visible columns', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
            exportValue: (row) => row.name,
            filter: {
              type: 'text',
              ariaLabel: 'Filter names',
            },
          },
          {
            id: 'weight',
            header: 'Weight',
            cell: (row) => row.weight,
            sortValue: (row) => row.weight,
            searchValue: (row) => String(row.weight),
            exportValue: (row) => String(row.weight),
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /open filter for name/i }));
    await user.type(screen.getByRole('textbox', { name: /filter names/i }), 'alpha{enter}');
    await user.click(screen.getByRole('button', { name: /^csv$/i }));

    expect(screen.getByRole('heading', { name: /csv preview/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /csv preview content/i })).toHaveValue('Name,Weight\nAlpha,10');
  });

  it('supports inline csv mode inside the shared grid surface when a workspace is configured', async () => {
    const user = userEvent.setup();

    function WorkspaceHarness() {
      const [mode, setMode] = React.useState<ScenarioDataGridWorkspaceMode>('browse');
      const [csv, setCsv] = React.useState('Name\nBeta');

      return (
        <ScenarioDataGrid
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              id: 'name',
              header: 'Name',
              cell: (row) => row.name,
              sortValue: (row) => row.name,
              searchValue: (row) => row.name,
              exportValue: (row) => row.name,
            },
          ]}
          workspace={{
            mode,
            onModeChange: setMode,
            csv: {
              value: csv,
              onChange: setCsv,
              helperText: <div>Edit raw CSV inline.</div>,
              ariaLabel: 'Inline CSV workspace',
            },
          }}
        />
      );
    }

    render(<WorkspaceHarness />);

    await user.click(screen.getByRole('button', { name: /^csv$/i }));

    expect(screen.queryByRole('heading', { name: /csv preview/i })).not.toBeInTheDocument();
    expect(screen.getByText(/edit raw csv inline/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /inline csv workspace/i })).toHaveValue('Name\nBeta');
    expect(screen.queryByRole('button', { name: /columns/i })).not.toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: /inline csv workspace/i }));
    await user.type(screen.getByRole('textbox', { name: /inline csv workspace/i }), 'Name\nBeta Prime');

    expect(screen.getByRole('textbox', { name: /inline csv workspace/i })).toHaveValue('Name\nBeta Prime');
  });

  it('supports controlled edit mode and mode-specific toolbar actions through the workspace api', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    function WorkspaceHarness() {
      const [mode, setMode] = React.useState<ScenarioDataGridWorkspaceMode>('browse');

      return (
        <ScenarioDataGrid
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              id: 'name',
              header: 'Name',
              cell: (row) => row.name,
              sortValue: (row) => row.name,
              searchValue: (row) => row.name,
              editor: {
                type: 'text',
                getValue: (row) => row.name,
                onCommit,
                ariaLabel: (row) => `Edit ${row.name}`,
              },
            },
          ]}
          workspace={{
            mode,
            onModeChange: setMode,
            toolbarActions: (activeMode) => activeMode === 'edit' ? <button type="button">Add row</button> : null,
          }}
        />
      );
    }

    render(<WorkspaceHarness />);

    await user.click(screen.getByRole('button', { name: /edit table/i }));

    expect(screen.getByRole('button', { name: /edit table/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /add row/i })).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: /edit beta/i });
    await user.clear(input);
    await user.type(input, 'Beta Prime');
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith(rows[0], 'Beta Prime');
  });

  it('round-trips typed primitive columns through shared draft edit mode', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <ScenarioDataGrid
        rows={[
          { id: 'row-a', name: 'Beta', weight: 20 },
        ]}
        rowKey={(row) => row.id}
        columns={[
          {
            kind: 'primitive',
            id: 'name',
            header: 'Name',
            primitive: 'string',
            getValue: (row) => row.name,
            setValue: (row, value) => ({ ...row, name: value ?? '' }),
          },
          {
            kind: 'primitive',
            id: 'weight',
            header: 'Weight',
            primitive: 'number',
            getValue: (row) => row.weight,
            setValue: (row, value) => ({ ...row, weight: value ?? 0 }),
          },
        ]}
        workspace={{
          mode: 'edit',
          onModeChange: vi.fn(),
          draft: {
            onApply,
          },
        }}
      />, 
    );

    const nameInput = screen.getByRole('textbox', { name: /edit name for row row-a/i });
    await user.clear(nameInput);
    await user.type(nameInput, 'Beta Prime');
    await user.tab();

    const weightInput = screen.getByRole('spinbutton', { name: /edit weight for row row-a/i });
    await user.clear(weightInput);
    await user.type(weightInput, '25');
    await user.tab();

    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApply).toHaveBeenCalledWith([
      { id: 'row-a', name: 'Beta Prime', weight: 25 },
    ]);
  });

  it('uses searchable checkbox multiselect editors and visible select dropdown affordances in shared draft edit mode', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <ScenarioDataGrid
        rows={[
          { id: 'row-a', tags: ['zulu'], team: 'failboat' },
        ]}
        rowKey={(row) => row.id}
        columns={[
          {
            kind: 'primitive',
            id: 'tags',
            header: 'Tags',
            primitive: 'array',
            itemType: 'string',
            options: [
              { value: 'zulu', label: 'Zulu' },
              { value: 'alpha', label: 'Alpha' },
              { value: 'mike', label: 'Mike' },
            ],
            getValue: (row) => row.tags,
            setValue: (row, value) => ({ ...row, tags: Array.isArray(value) ? value.map(String) : [] }),
          },
          {
            kind: 'primitive',
            id: 'team',
            header: 'Team',
            primitive: 'enum',
            options: [
              { value: 'support', label: 'Support' },
              { value: 'failboat', label: 'Failboat' },
            ],
            getValue: (row) => row.team,
            setValue: (row, value) => ({ ...row, team: value ?? 'failboat' }),
          },
        ]}
        workspace={{
          mode: 'edit',
          onModeChange: vi.fn(),
          draft: {
            onApply,
          },
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit tags for row row-a/i }));

    const multiSelectSearch = screen.getByRole('textbox', { name: /search edit tags for row row-a options/i });
    const checkboxLabels = screen.getAllByRole('checkbox').map((checkbox) => checkbox.parentElement?.textContent?.trim());
    expect(checkboxLabels).toEqual(['Zulu', 'Alpha', 'Mike']);

    await user.type(multiSelectSearch, 'mi');
    expect(screen.getByRole('checkbox', { name: 'Mike' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).not.toBeInTheDocument();

    await user.clear(multiSelectSearch);
    await user.click(screen.getByRole('checkbox', { name: 'Alpha' }));

    const checkboxLabelsAfterSelection = screen.getAllByRole('checkbox').map((checkbox) => checkbox.parentElement?.textContent?.trim());
    expect(checkboxLabelsAfterSelection).toEqual(['Alpha', 'Zulu', 'Mike']);

    const teamSelect = screen.getByRole('combobox', { name: /edit team for row row-a/i });
    await user.selectOptions(teamSelect, 'support');

    expect(teamSelect.parentElement?.querySelector('.lucide-chevron-down')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApply).toHaveBeenCalledWith([
      { id: 'row-a', tags: ['alpha', 'zulu'], team: 'support' },
    ]);
  });

  it('only shows add row when the workspace can actually create rows, and adds a visible draft row', async () => {
    const user = userEvent.setup();

    function AddRowHarness() {
      const [mode, setMode] = React.useState<ScenarioDataGridWorkspaceMode>('edit');

      return (
        <ScenarioDataGrid
          rows={[{ id: 'row-a', name: 'Beta' }]}
          rowKey={(row) => row.id}
          columns={[
            {
              kind: 'primitive',
              id: 'name',
              header: 'Name',
              primitive: 'string',
              getValue: (row) => row.name,
              setValue: (row, value) => ({ ...row, name: value ?? '' }),
            },
          ]}
          workspace={{
            mode,
            onModeChange: setMode,
            draft: {
              onApply: vi.fn(),
              createRow: () => ({ id: 'row-b', name: '' }),
            },
          }}
        />
      );
    }

    render(<AddRowHarness />);

    await user.click(screen.getByRole('button', { name: /add row/i }));

    expect(screen.getByRole('textbox', { name: /edit name for row row-b/i })).toBeInTheDocument();
  });

  it('hides add row when the draft workspace has no createRow handler', () => {
    render(
      <ScenarioDataGrid
        rows={[{ id: 'row-a', name: 'Beta' }]}
        rowKey={(row) => row.id}
        columns={[
          {
            kind: 'primitive',
            id: 'name',
            header: 'Name',
            primitive: 'string',
            getValue: (row) => row.name,
            setValue: (row, value) => ({ ...row, name: value ?? '' }),
          },
        ]}
        workspace={{
          mode: 'edit',
          onModeChange: vi.fn(),
          draft: {
            onApply: vi.fn(),
          },
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: /add row/i })).not.toBeInTheDocument();
  });

  it('round-trips typed primitive columns through shared csv mode and validates invalid values', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    function TypedCsvHarness() {
      const [mode, setMode] = React.useState<ScenarioDataGridWorkspaceMode>('browse');

      return (
        <ScenarioDataGrid
          rows={[
            { id: 'row-a', name: 'Beta', weight: 20, sessions: [1, 2], team: 'Blue' },
          ]}
          rowKey={(row) => row.id}
          columns={[
            {
              kind: 'primitive',
              id: 'name',
              header: 'Name',
              primitive: 'string',
              getValue: (row) => row.name,
              setValue: (row, value) => ({ ...row, name: value ?? '' }),
            },
            {
              kind: 'primitive',
              id: 'weight',
              header: 'Weight',
              primitive: 'number',
              getValue: (row) => row.weight,
              setValue: (row, value) => ({ ...row, weight: value ?? 0 }),
            },
            {
              kind: 'primitive',
              id: 'sessions',
              header: 'Sessions',
              primitive: 'array',
              itemType: 'number',
              options: [
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
              ],
              getValue: (row) => row.sessions,
              setValue: (row, value) => ({ ...row, sessions: (value as number[] | undefined) ?? [] }),
            },
            {
              kind: 'primitive',
              id: 'team',
              header: 'Team',
              primitive: 'enum',
              options: [
                { value: 'Blue', label: 'Blue' },
                { value: 'Red', label: 'Red' },
              ],
              getValue: (row) => row.team,
              setValue: (row, value) => ({ ...row, team: value ?? 'Blue' }),
            },
          ]}
          workspace={{
            mode,
            onModeChange: setMode,
            draft: {
              onApply,
              csv: {
                ariaLabel: 'Typed CSV editor',
                helperText: <div>Typed CSV helper</div>,
              },
            },
          }}
        />
      );
    }

    render(<TypedCsvHarness />);

    await user.click(screen.getByRole('button', { name: /^csv$/i }));

    const csvInput = screen.getByRole('textbox', { name: /typed csv editor/i });
    expect(csvInput).toHaveValue('Name,Weight,Sessions,Team\nBeta,20,"[1,2]",Blue');

    fireEvent.change(csvInput, {
      target: { value: 'Name,Weight,Sessions,Team\nBeta Prime,25,"[1,3]",Red' },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApply).toHaveBeenCalledWith([
      { id: 'row-a', name: 'Beta Prime', weight: 25, sessions: [1, 3], team: 'Red' },
    ]);

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const invalidCsvInput = screen.getByRole('textbox', { name: /typed csv editor/i });
    fireEvent.change(invalidCsvInput, {
      target: { value: 'Name,Weight,Sessions,Team\nBroken,nope,"[1,2]",Green' },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(screen.getByText(/csv validation errors/i)).toBeInTheDocument();
    expect(screen.getByText(/expected a number for weight/i)).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('supports custom columns with JSON raw codecs in shared csv mode', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    function CustomJsonHarness() {
      const [mode, setMode] = React.useState<ScenarioDataGridWorkspaceMode>('browse');

      return (
        <ScenarioDataGrid
          rows={[
            {
              id: 'rule-1',
              attribute: 'Gender',
              targets: { female: 2, 'asdf | asdf:': 1 },
            },
          ]}
          rowKey={(row) => row.id}
          columns={[
            {
              kind: 'primitive',
              id: 'attribute',
              header: 'Attribute',
              primitive: 'string',
              getValue: (row) => row.attribute,
              setValue: (row, value) => ({ ...row, attribute: value ?? '' }),
            },
            {
              kind: 'custom',
              id: 'targets',
              header: 'Targets',
              getValue: (row) => row.targets,
              setValue: (row, value) => ({ ...row, targets: (value as Record<string, number> | undefined) ?? {} }),
              renderValue: (value) => Object.entries(value ?? {}).map(([key, count]) => `${key}: ${count}`).join(' · ') || '—',
              searchText: (value) => Object.entries(value ?? {}).map(([key, count]) => `${key} ${count}`).join(' '),
              rawCodec: createJsonRawCodec({
                header: 'Targets',
                validate: validateStringNumberRecordValue({ header: 'Targets' }),
              }),
            },
          ]}
          workspace={{
            mode,
            onModeChange: setMode,
            draft: {
              onApply,
              csv: {
                ariaLabel: 'Custom JSON CSV editor',
              },
            },
          }}
        />
      );
    }

    render(<CustomJsonHarness />);

    expect(screen.getByText(/female: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/asdf \| asdf:: 1/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const csvInput = screen.getByRole('textbox', { name: /custom json csv editor/i });
    expect(csvInput).toHaveValue('Attribute,Targets\nGender,"{""female"":2,""asdf | asdf:"":1}"');

    fireEvent.change(csvInput, {
      target: { value: 'Attribute,Targets\nGender,"{""female"":3,""asdf | asdf:"":2}"' },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApply).toHaveBeenCalledWith([
      {
        id: 'rule-1',
        attribute: 'Gender',
        targets: { female: 3, 'asdf | asdf:': 2 },
      },
    ]);

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const invalidCsvInput = screen.getByRole('textbox', { name: /custom json csv editor/i });
    fireEvent.change(invalidCsvInput, {
      target: { value: 'Attribute,Targets\nGender,not-json' },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(screen.getByText(/csv validation errors/i)).toBeInTheDocument();
    expect(screen.getByText(/expected valid json for targets/i)).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('round-trips optional session-scope custom columns through shared csv mode', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    function TestGrid() {
      const [mode, setMode] = React.useState<ScenarioDataGridWorkspaceMode>('browse');

      return (
        <ScenarioDataGrid
          rows={[
            { id: 'a', name: 'Alpha', sessions: undefined as number[] | undefined },
            { id: 'b', name: 'Beta', sessions: [0, 1, 2] as number[] | undefined },
          ]}
          rowKey={(row) => row.id}
          columns={[
            {
              kind: 'primitive',
              id: 'name',
              header: 'Name',
              primitive: 'string',
              getValue: (row) => row.name,
              setValue: (row, value) => ({ ...row, name: value ?? '' }),
            },
            createOptionalSessionScopeColumn({
              totalSessions: 3,
              getSessions: (row) => row.sessions,
              setSessions: (row, sessions) => ({ ...row, sessions }),
            }),
          ]}
          workspace={{
            mode,
            onModeChange: setMode,
            draft: {
              onApply,
              csv: {
                ariaLabel: 'Session scope csv editor',
              },
            },
          }}
        />
      );
    }

    render(<TestGrid />);

    expect(screen.getByText('All sessions')).toBeInTheDocument();
    expect(screen.getByText('1, 2, 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const csvInput = screen.getByRole('textbox', { name: /session scope csv editor/i });
    expect(csvInput).toHaveValue(
      'Name,Sessions\nAlpha,"{""mode"":""all""}"\nBeta,"{""mode"":""selected"",""sessions"":[0,1,2]}"',
    );

    fireEvent.change(csvInput, {
      target: {
        value: 'Name,Sessions\nAlpha,"{""mode"":""selected"",""sessions"":[0,1,2]}"\nBeta,"{""mode"":""all""}"',
      },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApply).toHaveBeenCalledWith([
      { id: 'a', name: 'Alpha', sessions: [0, 1, 2] },
      { id: 'b', name: 'Beta', sessions: undefined },
    ]);
  });

  it('round-trips punctuation-heavy string arrays safely through JSON raw csv mode', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    function ArrayJsonHarness() {
      const [mode, setMode] = React.useState<ScenarioDataGridWorkspaceMode>('browse');

      return (
        <ScenarioDataGrid
          rows={[
            {
              id: 'row-a',
              labels: ['alpha', 'asdf | asdf:', 'hello, world'],
            },
          ]}
          rowKey={(row) => row.id}
          columns={[
            {
              kind: 'primitive',
              id: 'labels',
              header: 'Labels',
              primitive: 'array',
              itemType: 'string',
              getValue: (row) => row.labels,
              setValue: (row, value) => ({ ...row, labels: Array.isArray(value) ? value.map(String) : [] }),
            },
          ]}
          workspace={{
            mode,
            onModeChange: setMode,
            draft: {
              onApply,
              csv: {
                ariaLabel: 'Array JSON CSV editor',
              },
            },
          }}
        />
      );
    }

    render(<ArrayJsonHarness />);

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const csvInput = screen.getByRole('textbox', { name: /array json csv editor/i });
    expect(csvInput).toHaveValue('Labels\n"[""alpha"",""asdf | asdf:"",""hello, world""]"');

    fireEvent.change(csvInput, {
      target: { value: 'Labels\n"[""alpha"",""semi;colon"",""pipe | thing"",""hello, world""]"' },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApply).toHaveBeenCalledWith([
      {
        id: 'row-a',
        labels: ['alpha', 'semi;colon', 'pipe | thing', 'hello, world'],
      },
    ]);
  });

  it('expands structured finite-key fields into shared edit and csv columns', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    function StructuredHarness() {
      const [mode, setMode] = React.useState<ScenarioDataGridWorkspaceMode>('browse');

      return (
        <ScenarioDataGrid
          rows={[
            {
              id: 'rule-1',
              attribute: 'role',
              desired: { dev: 2, pm: 1 },
              availableKeys: ['dev', 'pm'],
              mode: 'exact',
            },
            {
              id: 'rule-2',
              attribute: 'level',
              desired: { senior: 1 },
              availableKeys: ['junior', 'senior'],
              mode: 'at_least',
            },
          ]}
          rowKey={(row) => row.id}
          columns={[
            {
              kind: 'primitive',
              id: 'attribute',
              header: 'Attribute',
              primitive: 'string',
              getValue: (row) => row.attribute,
              setValue: (row, value) => ({ ...row, attribute: value ?? '' }),
            },
            {
              kind: 'structured',
              structured: 'finite-key-map',
              id: 'desired-values',
              header: 'Desired values',
              childPrimitive: 'number',
              keys: (structuredRows) => {
                const keySet = new Set(structuredRows.flatMap((row) => row.availableKeys));
                return Array.from(keySet.values()).map((key) => ({ value: key, label: key }));
              },
              getValue: (row, key) => row.desired[key],
              setValue: (row, key, value) => ({
                ...row,
                desired: value == null
                  ? Object.fromEntries(Object.entries(row.desired).filter(([entryKey]) => entryKey !== key))
                  : { ...row.desired, [key]: value },
              }),
              isKeyAvailable: (row, key) => row.availableKeys.includes(key),
            },
            {
              kind: 'primitive',
              id: 'mode',
              header: 'Mode',
              primitive: 'enum',
              options: [
                { value: 'exact', label: 'exact' },
                { value: 'at_least', label: 'at least' },
              ],
              getValue: (row) => row.mode,
              setValue: (row, value) => ({ ...row, mode: value ?? 'exact' }),
            },
          ]}
          workspace={{
            mode,
            onModeChange: setMode,
            draft: {
              onApply,
              csv: {
                ariaLabel: 'Structured CSV editor',
              },
            },
          }}
        />
      );
    }

    render(<StructuredHarness />);

    expect(screen.getByRole('columnheader', { name: /dev/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /pm/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /senior/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit table/i }));

    const devInput = screen.getByRole('spinbutton', { name: /edit dev for row rule-1/i });
    fireEvent.change(devInput, { target: { value: '3' } });
    fireEvent.blur(devInput);

    expect(screen.getByRole('spinbutton', { name: /edit dev for row rule-2/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const csvInput = screen.getByRole('textbox', { name: /structured csv editor/i });
    expect(csvInput).toHaveValue('Attribute,dev,pm,junior,senior,Mode\nrole,3,1,,,exact\nlevel,,,,1,at_least');

    fireEvent.change(csvInput, {
      target: { value: 'Attribute,dev,pm,junior,senior,Mode\nrole,4,2,,,exact\nlevel,,,2,1,at_least' },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApply).toHaveBeenCalledWith([
      {
        id: 'rule-1',
        attribute: 'role',
        desired: { dev: 4, pm: 2 },
        availableKeys: ['dev', 'pm'],
        mode: 'exact',
      },
      {
        id: 'rule-2',
        attribute: 'level',
        desired: { junior: 2, senior: 1 },
        availableKeys: ['junior', 'senior'],
        mode: 'at_least',
      },
    ]);
  }, 15000);

  it('paginates large row sets to limit rendered rows', async () => {
    const user = userEvent.setup();
    const largeRows = Array.from({ length: 120 }, (_, index) => ({
      id: `row-${index + 1}`,
      name: `Person ${index + 1}`,
      weight: index + 1,
    }));

    render(
      <ScenarioDataGrid
        rows={largeRows}
        rowKey={(row) => row.id}
        pageSize={50}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
          },
        ]}
      />,
    );

    expect(screen.getByText('Person 1')).toBeInTheDocument();
    expect(screen.queryByText('Person 75')).not.toBeInTheDocument();
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Person 75')).toBeInTheDocument();
  });

  it('keeps the rows-per-page control visible when all rows fit on one page but smaller page sizes remain possible', async () => {
    const user = userEvent.setup();
    const largeRows = Array.from({ length: 120 }, (_, index) => ({
      id: `row-${index + 1}`,
      name: `Person ${index + 1}`,
      weight: index + 1,
    }));

    render(
      <ScenarioDataGrid
        rows={largeRows}
        rowKey={(row) => row.id}
        pageSize={50}
        pageSizeOptions={[50, 100, 250, 500]}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
          },
        ]}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /rows per page/i }), '250');

    expect(screen.getByRole('combobox', { name: /rows per page/i })).toHaveValue('250');
    expect(screen.queryByText(/page 1 of 1/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: /rows per page/i }), '50');

    expect(screen.getByRole('combobox', { name: /rows per page/i })).toHaveValue('50');
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
  });

  it('allows resizing the data-grid viewport by dragging the resize handle', () => {
    render(
      <ScenarioDataGrid
        rows={Array.from({ length: 120 }, (_, index) => ({
          id: `row-${index + 1}`,
          name: `Person ${index + 1}`,
          weight: index + 1,
        }))}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
          },
        ]}
      />,
    );

    const bodyRegion = screen.getByRole('region', { name: /data grid rows/i });
    Object.defineProperty(bodyRegion, 'clientHeight', {
      configurable: true,
      value: 360,
    });
    bodyRegion.getBoundingClientRect = () => ({
      x: 0,
      y: 120,
      width: 800,
      height: 360,
      top: 120,
      right: 800,
      bottom: 480,
      left: 0,
      toJSON: () => '',
    });

    fireEvent.pointerDown(screen.getByRole('separator', { name: /resize grid height/i }), { button: 0, clientY: 300 });
    fireEvent.pointerMove(window, { clientY: 420 });
    fireEvent.pointerUp(window);

    expect(bodyRegion).toHaveStyle({ height: '480px', maxHeight: 'none' });
  });

  it('renders session editor popovers outside the grid viewport to avoid clipping', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioDataGrid
        defaultEditMode
        rows={[{ id: 'rule-1', sessions: undefined as number[] | undefined }]}
        rowKey={(row) => row.id}
        columns={[
          createOptionalSessionScopeColumn({
            totalSessions: 5,
            getSessions: (row) => row.sessions,
            setSessions: (row, sessions) => ({ ...row, sessions }),
          }),
        ]}
      />,
    );

    const bodyRegion = screen.getByRole('region', { name: /data grid rows/i });

    await user.click(screen.getByRole('button', { name: /edit sessions/i }));

    const popover = screen.getByRole('button', { name: /close edit sessions/i }).closest('[data-grid-popover="true"]');
    expect(popover).toBeInTheDocument();
    expect(bodyRegion.contains(popover)).toBe(false);
    expect(screen.getByRole('radio', { name: /only selected sessions/i })).toBeInTheDocument();
  });

  it('shows compact session numbers in edit mode without the selected prefix', () => {
    render(
      <ScenarioDataGrid
        defaultEditMode
        rows={[{ id: 'rule-1', sessions: [0] as number[] | undefined }]}
        rowKey={(row) => row.id}
        columns={[
          createOptionalSessionScopeColumn({
            totalSessions: 5,
            getSessions: (row) => row.sessions,
            setSessions: (row, sessions) => ({ ...row, sessions }),
          }),
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: /edit sessions/i })).toHaveTextContent(/^1$/);
    expect(screen.queryByText(/^Selected:/i)).not.toBeInTheDocument();
  });

  it('virtualizes edit-mode rows and mounts scrolled editors on demand', async () => {
    render(
      <ScenarioDataGrid
        rows={Array.from({ length: 120 }, (_, index) => ({
          id: `row-${index + 1}`,
          name: `Person ${index + 1}`,
        }))}
        rowKey={(row) => row.id}
        columns={[
          {
            kind: 'primitive',
            id: 'name',
            header: 'Name',
            primitive: 'string',
            getValue: (row) => row.name,
            setValue: (row, value) => ({ ...row, name: value ?? '' }),
          },
        ]}
        workspace={{
          mode: 'edit',
          onModeChange: vi.fn(),
          draft: {
            onApply: vi.fn(),
          },
        }}
      />,
    );

    const bodyRegion = screen.getByRole('region', { name: /data grid rows/i });
    expect(screen.getByRole('textbox', { name: /^edit name for row row-1$/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^edit name for row row-80$/i })).not.toBeInTheDocument();

    Object.defineProperty(bodyRegion, 'clientHeight', {
      configurable: true,
      value: 240,
    });
    bodyRegion.scrollTop = 52 * 70;
    fireEvent.scroll(bodyRegion);

    expect(await screen.findByRole('textbox', { name: /^edit name for row row-80$/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^edit name for row row-1$/i })).not.toBeInTheDocument();
  });

  it('resets a manual viewport resize when escape is pressed on the handle', () => {
    render(
      <ScenarioDataGrid
        rows={Array.from({ length: 120 }, (_, index) => ({
          id: `row-${index + 1}`,
          name: `Person ${index + 1}`,
          weight: index + 1,
        }))}
        rowKey={(row) => row.id}
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
            sortValue: (row) => row.name,
            searchValue: (row) => row.name,
          },
        ]}
      />,
    );

    const bodyRegion = screen.getByRole('region', { name: /data grid rows/i });
    Object.defineProperty(bodyRegion, 'clientHeight', {
      configurable: true,
      value: 360,
    });
    bodyRegion.getBoundingClientRect = () => ({
      x: 0,
      y: 120,
      width: 800,
      height: 360,
      top: 120,
      right: 800,
      bottom: 480,
      left: 0,
      toJSON: () => '',
    });

    const handle = screen.getByRole('separator', { name: /resize grid height/i });
    fireEvent.pointerDown(handle, { button: 0, clientY: 300 });
    fireEvent.pointerMove(window, { clientY: 420 });
    fireEvent.pointerUp(window);
    expect(bodyRegion).toHaveStyle({ height: '480px' });

    fireEvent.keyDown(handle, { key: 'Escape' });
    expect(bodyRegion).not.toHaveStyle({ height: '480px' });
    expect(bodyRegion.style.height).toBe('');
  });
});
