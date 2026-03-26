import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioSetupSectionRenderer } from './ScenarioSetupSectionRenderer';
import type { ScenarioEditorController } from './useScenarioEditorController';

function createController(): ScenarioEditorController {
  return {
    activeSection: 'attributes',
    attributeDefinitions: [{ key: 'role', values: ['dev', 'pm'] }],
    removeAttributeDefinition: vi.fn(),
    entities: {
      setShowAttributeForm: vi.fn(),
      handleEditAttribute: vi.fn(),
    },
  } as unknown as ScenarioEditorController;
}

describe('ScenarioSetupSectionRenderer', () => {
  it('renders Attribute Definitions as a first-class section', async () => {
    const user = userEvent.setup();

    render(<ScenarioSetupSectionRenderer controller={createController()} />);

    expect(screen.getByText(/attribute definitions/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /attribute definitions/i }));

    expect(screen.getByText(/attributes are key-value pairs/i)).toBeInTheDocument();
  });
});
