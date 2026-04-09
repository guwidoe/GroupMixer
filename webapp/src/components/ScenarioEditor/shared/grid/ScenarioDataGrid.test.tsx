import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioDataGrid } from './ScenarioDataGrid';

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
