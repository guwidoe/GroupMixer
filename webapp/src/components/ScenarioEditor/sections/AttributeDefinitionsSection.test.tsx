import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAttributeDefinition } from '../../../services/scenarioAttributes';
import { AttributeDefinitionsSection } from './AttributeDefinitionsSection';

describe('AttributeDefinitionsSection', () => {
  it('supports cards/list switching and section actions through the shared collection architecture', async () => {
    const user = userEvent.setup();
    const onAddAttribute = vi.fn();
    const onEditAttribute = vi.fn();
    const onRemoveAttribute = vi.fn();

    render(
      <AttributeDefinitionsSection
        attributeDefinitions={[createAttributeDefinition('role', ['dev', 'pm'], 'attr-role')]}
        onAddAttribute={onAddAttribute}
        onEditAttribute={onEditAttribute}
        onRemoveAttribute={onRemoveAttribute}
      />,
    );

    await user.click(screen.getByRole('button', { name: /add attribute/i }));
    expect(onAddAttribute).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /edit role/i }));
    expect(onEditAttribute).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('columnheader', { name: /attribute/i })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /delete role/i })[0]!);
    expect(onRemoveAttribute).toHaveBeenCalledWith('role');
  });
});
