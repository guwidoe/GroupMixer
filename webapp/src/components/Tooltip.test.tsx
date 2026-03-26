import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip';

function mockElementSize(width: number, height: number) {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return this.getAttribute('role') === 'tooltip' ? width : 24;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return this.getAttribute('role') === 'tooltip' ? height : 24;
    },
  });
}

describe('Tooltip', () => {
  beforeEach(() => {
    mockElementSize(120, 40);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows tooltip content on hover', async () => {
    const user = userEvent.setup();

    render(
      <Tooltip content="Full label">
        <button type="button">Trigger</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const wrapper = trigger.parentElement as HTMLSpanElement;
    wrapper.getBoundingClientRect = () => ({
      x: 80,
      y: 80,
      width: 24,
      height: 24,
      top: 80,
      right: 104,
      bottom: 104,
      left: 80,
      toJSON: () => ({}),
    }) as DOMRect;

    await user.hover(trigger);

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Full label');
    });
  });

  it('flips to the left when there is not enough space on the right', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(220);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(180);

    render(
      <Tooltip content="Full label" placement="right">
        <button type="button">Trigger</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const wrapper = trigger.parentElement as HTMLSpanElement;
    wrapper.getBoundingClientRect = () => ({
      x: 180,
      y: 60,
      width: 24,
      height: 24,
      top: 60,
      right: 204,
      bottom: 84,
      left: 180,
      toJSON: () => ({}),
    }) as DOMRect;

    await user.hover(trigger);

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveAttribute('data-placement', 'left');
    });
  });
});
