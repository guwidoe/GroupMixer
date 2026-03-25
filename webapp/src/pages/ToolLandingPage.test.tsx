import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useAppStore } from '../store';
import ToolLandingPage from './ToolLandingPage';

vi.mock('../services/solver/solveProblem', () => ({
  solveProblem: vi.fn(async ({ problem }: { problem: { people: Array<{ id: string }>; groups: Array<{ id: string }>; num_sessions: number } }) => ({
    selectedSettings: problem.settings,
    runProblem: problem,
    lastProgress: null,
    solution: {
      assignments: Array.from({ length: problem.num_sessions }).flatMap((_, sessionIndex) =>
        problem.people.map((person, personIndex) => ({
          person_id: person.id,
          group_id: problem.groups[personIndex % problem.groups.length]?.id ?? problem.groups[0].id,
          session_id: sessionIndex,
        })),
      ),
      final_score: 0,
      unique_contacts: 0,
      repetition_penalty: 0,
      attribute_balance_penalty: 0,
      constraint_penalty: 0,
      iteration_count: 10,
      elapsed_time_ms: 5,
    },
  })),
}));

beforeEach(() => {
  window.localStorage.clear();
  window.__groupmixerLandingEvents = [];
  useAppStore.getState().reset();
});

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
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'landing_route_viewed' }),
      ]),
    );
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

    await user.click(screen.getByRole('button', { name: /open in advanced workspace/i }));

    const state = useAppStore.getState();
    expect(state.currentProblemId).toBeNull();
    expect(state.problem).not.toBeNull();
    expect(state.solution).not.toBeNull();
    expect(state.ui.activeTab).toBe('results');
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'landing_generate_clicked' }),
        expect.objectContaining({ name: 'landing_open_advanced_workspace' }),
      ]),
    );
  });
});
