import { render, screen } from '@testing-library/react';
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
  it('renders Attribute Definitions as a first-class section', () => {
    render(<ScenarioSetupSectionRenderer controller={createController()} />);

    expect(screen.getByRole('heading', { name: /attribute definitions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add attribute/i })).toBeInTheDocument();
    expect(screen.getByText(/attributes are key-value pairs/i)).toBeInTheDocument();
  });
});
