import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SetupSearchField } from './SetupSearchField';

describe('SetupSearchField', () => {
  it('keeps a sensible minimum width while remaining responsive', () => {
    render(<SetupSearchField label="Search people" placeholder="Search people..." />);

    const field = screen.getByLabelText(/search people/i).closest('label');
    expect(field).toHaveClass('w-full');
    expect(field).toHaveClass('sm:min-w-[16rem]');
    expect(field).toHaveClass('md:max-w-sm');
  });
});
