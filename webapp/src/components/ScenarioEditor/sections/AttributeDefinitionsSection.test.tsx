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
        onApplyGridAttributes={vi.fn()}
        createGridAttributeRow={() => createAttributeDefinition('track', ['design'], 'attr-track')}
      />,
    );

    await user.click(screen.getByRole('button', { name: /add attribute/i }));
    expect(onAddAttribute).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /^cards$/i }));
    expect(screen.getByRole('textbox', { name: /search attributes/i })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /search attributes/i }), 'zzz');
    expect(screen.getByText(/no attributes match this search/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.getByText('role')).toBeInTheDocument();

    await user.click(screen.getByText('role'));
    expect(onEditAttribute).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('columnheader', { name: /attribute/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit table/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^csv$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^view$/i })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /delete role/i })[0]!);
    expect(onRemoveAttribute).toHaveBeenCalledWith('role');

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    expect(screen.getByRole('textbox', { name: /attribute definitions csv/i })).toHaveValue(
      'Attribute,Values\nrole,"[""dev"",""pm""]"',
    );
  }, 10000);
});
