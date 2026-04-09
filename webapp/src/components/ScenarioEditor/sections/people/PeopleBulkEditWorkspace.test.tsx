import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeopleBulkEditWorkspace } from './PeopleBulkEditWorkspace';

describe('PeopleBulkEditWorkspace', () => {
  it('supports inline grid editing, row/column creation, and csv mode switching', async () => {
    const user = userEvent.setup();
    const setRows = vi.fn();
    const setHeaders = vi.fn();
    const setCsvInput = vi.fn();
    const setTextMode = vi.fn();

    render(
      <PeopleBulkEditWorkspace
        textMode="grid"
        setTextMode={setTextMode}
        csvInput=""
        setCsvInput={setCsvInput}
        headers={['id', 'name']}
        setHeaders={setHeaders}
        rows={[{ id: 'p1', name: 'Alex' }]}
        setRows={setRows}
        onRefreshFromCurrent={vi.fn()}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /add row/i }));
    expect(setRows).toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: /new bulk-edit column name/i }), 'team');
    await user.click(screen.getByRole('button', { name: /add column/i }));
    expect(setHeaders).toHaveBeenCalled();
    expect(setRows).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    expect(setCsvInput).toHaveBeenCalled();
    expect(setTextMode).toHaveBeenCalledWith('text');
  });
});
