import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ToolLandingPage from './ToolLandingPage';

describe('ToolLandingPage SEO wiring', () => {
  it('renders route-specific copy and updates document metadata from config', async () => {
    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="random-team-generator" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Random team generator for workshops, projects, and events.',
      }),
    ).toBeInTheDocument();

    expect(document.title).toBe('Random Team Generator — GroupMixer');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Create random teams quickly with GroupMixer, then use the advanced app for balancing, constraints, and multi-session team planning.',
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://www.groupmixer.app/random-team-generator',
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Random Team Generator — GroupMixer',
    );

    const schema = document.getElementById('groupmixer-route-schema');
    expect(schema?.textContent).toContain('WebApplication');
    expect(schema?.textContent).toContain('FAQPage');
    expect(schema?.textContent).toContain('GroupMixer');
  });

  it('generates groups locally from the landing tool without using /app', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /generate groups/i }));

    expect(await screen.findByRole('heading', { name: /session 1/i })).toBeInTheDocument();
    expect(await screen.findByText('Group 1')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /reshuffle/i })).toBeEnabled();
    expect(await screen.findByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });
});
