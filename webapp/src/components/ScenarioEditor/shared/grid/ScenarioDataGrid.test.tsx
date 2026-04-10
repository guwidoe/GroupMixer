import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioDataGrid } from './ScenarioDataGrid';
import type { ScenarioDataGridWorkspaceMode } from './types';

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

  it('filters rows from the shared data source', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        searchPlaceholder="Search names"
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

    await user.type(screen.getByRole('textbox', { name: /search table/i }), 'alpha');

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('can hide the global search row when a section relies on column filters instead', () => {
    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        showGlobalSearch={false}
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
    expect(screen.getByText(/showing 2 of 2 rows/i)).toBeInTheDocument();
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

    await user.type(screen.getByRole('textbox', { name: /search table/i }), 'alpha');
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

    expect(screen.getByRole('button', { name: /done editing/i })).toBeInTheDocument();
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
    expect(csvInput).toHaveValue('Name,Weight,Sessions,Team\nBeta,20,1 | 2,Blue');

    await user.clear(csvInput);
    await user.type(csvInput, 'Name,Weight,Sessions,Team\nBeta Prime,25,1 | 3,Red');
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApply).toHaveBeenCalledWith([
      { id: 'row-a', name: 'Beta Prime', weight: 25, sessions: [1, 3], team: 'Red' },
    ]);

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const invalidCsvInput = screen.getByRole('textbox', { name: /typed csv editor/i });
    await user.clear(invalidCsvInput);
    await user.type(invalidCsvInput, 'Name,Weight,Sessions,Team\nBroken,nope,1 | 2,Green');
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(screen.getByText(/csv validation errors/i)).toBeInTheDocument();
    expect(screen.getByText(/expected a number for weight/i)).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

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
});
