import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, getButtonClassName } from './Button';

describe('Button', () => {
  it('applies shared variant and size classes', () => {
    render(
      <Button variant="primary" size="lg">
        Save
      </Button>,
    );

    expect(screen.getByRole('button', { name: /save/i })).toHaveClass('ui-button');
    expect(screen.getByRole('button', { name: /save/i })).toHaveClass('ui-button--primary');
    expect(screen.getByRole('button', { name: /save/i })).toHaveClass('ui-button--lg');
  });

  it('builds reusable classes for non-button elements like header links', () => {
    expect(getButtonClassName({ variant: 'secondary', size: 'lg' })).toContain('ui-button--secondary');
    expect(getButtonClassName({ variant: 'secondary', size: 'lg' })).toContain('ui-button--lg');
  });
});
