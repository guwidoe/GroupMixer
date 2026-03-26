import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProblemSetupSectionRenderer } from './ProblemSetupSectionRenderer';
import type { ProblemEditorController } from './useProblemEditorController';

function createController(): ProblemEditorController {
  return {
    activeSection: 'attributes',
    attributeDefinitions: [{ key: 'role', values: ['dev', 'pm'] }],
    removeAttributeDefinition: vi.fn(),
    entities: {
      setShowAttributeForm: vi.fn(),
      handleEditAttribute: vi.fn(),
    },
  } as unknown as ProblemEditorController;
}

describe('ProblemSetupSectionRenderer', () => {
  it('renders Attribute Definitions as a first-class section', async () => {
    const user = userEvent.setup();

    render(<ProblemSetupSectionRenderer controller={createController()} />);

    expect(screen.getByText(/attribute definitions/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /attribute definitions/i }));

    expect(screen.getByText(/attributes are key-value pairs/i)).toBeInTheDocument();
  });
});
