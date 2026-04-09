import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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

  it('filters rows from the shared data source', () => {
    render(
      <ScenarioDataGrid
        rows={rows}
        rowKey={(row) => row.id}
        filterQuery="alpha"
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

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
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
});
