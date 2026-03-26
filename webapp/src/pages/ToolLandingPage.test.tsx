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
      <MemoryRouter initialEntries={['/random-team-generator?exp=seo-hero-test&var=B']}>
        <ToolLandingPage pageKey="random-team-generator" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Random Team Generator',
      }),
    ).toBeInTheDocument();

    expect(document.title).toBe('Random Team Generator — Create Balanced Teams Fast | GroupMixer');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Free random team generator. Paste names and create balanced teams instantly. Add rules for skill balancing, keep-together, and keep-apart when needed.',
    );
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://www.groupmixer.app/random-team-generator',
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Random Team Generator — Create Balanced Teams Fast | GroupMixer',
    );

    const schema = document.getElementById('groupmixer-route-schema');
    expect(schema?.textContent).toContain('WebApplication');
    expect(schema?.textContent).toContain('FAQPage');
    expect(schema?.textContent).toContain('GroupMixer');
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'landing_view',
          payload: expect.objectContaining({
            landingSlug: 'random-team-generator',
            experiment: 'seo-hero-test',
            variant: 'B',
          }),
        }),
      ]),
    );
    expect(screen.getByRole('link', { name: /expert workspace/i })).toHaveAttribute(
      'href',
      '/app?lp=random-team-generator&exp=seo-hero-test&var=B',
    );
  });

  it('generates groups locally from the landing tool without leaving the page', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /generate groups/i }));

    // Results appear inline
    expect(await screen.findByRole('heading', { name: /your groups/i })).toBeInTheDocument();
    expect(await screen.findByText('Group 1')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /export csv/i })).toBeInTheDocument();

    // Can transition to expert workspace
    await user.click(screen.getByRole('button', { name: /open in expert workspace/i }));

    const state = useAppStore.getState();
    expect(state.currentProblemId).toBeTruthy();
    expect(state.problem).not.toBeNull();
    expect(state.solution).not.toBeNull();
    expect(state.ui.activeTab).toBe('results');
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'landing_generate_clicked' }),
        expect.objectContaining({ name: 'landing_open_advanced_workspace' }),
      ]),
    );
  }, 10000);

  it('syncs a new expert-workspace problem in the background and carries edits into /app', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" />
      </MemoryRouter>,
    );

    const textarea = screen.getByLabelText(/participants/i);
    await user.clear(textarea);
    await user.type(textarea, 'Ada\nGrace\nLinus\nMargaret');

    await user.click(screen.getAllByRole('button', { name: /expert workspace/i })[0]);

    const state = useAppStore.getState();
    expect(state.currentProblemId).toBeTruthy();
    expect(state.problem?.people.map((person) => person.id)).toEqual(['Ada', 'Grace', 'Linus', 'Margaret']);
    expect(state.savedProblems[state.currentProblemId!]?.problem.people.map((person) => person.id)).toEqual([
      'Ada',
      'Grace',
      'Linus',
      'Margaret',
    ]);
  }, 10000);

  it('shows the tool form above the fold with participants input and generate button', () => {
    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" />
      </MemoryRouter>,
    );

    // Tool form is visible immediately
    expect(screen.getByLabelText(/participants/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate groups/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate groups/i })).toHaveClass('btn-primary');
    
    // Trust signals visible (exact match on the dot-prefixed trust items)
    expect(screen.getByText('Private (processed in your browser)')).toBeInTheDocument();
    expect(screen.getByText('No sign-up')).toBeInTheDocument();
    expect(screen.getByText('Results in seconds')).toBeInTheDocument();

    // Optimizer CTA fills the desktop dead-space under the hero copy
    expect(screen.getByText(/want to do better than random/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /try the full group optimizer/i })).toBeInTheDocument();
    expect(screen.getByText(/your landing-page draft comes with you/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /open expert workspace/i })[0]).toHaveClass('btn-primary');
  }, 10000);

  it('stacks the generator above the hero content on mobile while preserving desktop order classes', () => {
    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('landing-tool-panel')).toHaveClass('order-1', 'lg:order-2');
    expect(screen.getByTestId('landing-hero')).toHaveClass('order-2', 'lg:order-1');
  });

  it('renders FAQ section for SEO', () => {
    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /frequently asked questions/i })).toBeInTheDocument();
    expect(screen.getByText(/how do i split a list of names into random groups/i)).toBeInTheDocument();
  });

  it('keeps results above the hero content on mobile once groups are generated', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /generate groups/i }));

    expect(await screen.findByTestId('landing-results-panel')).toHaveClass('order-2', 'lg:order-3', 'lg:col-span-2');
    expect(screen.getByTestId('landing-hero')).toHaveClass('order-3', 'lg:order-1');
  });

  it('uses consistent comma-separated helper text for advanced constraint inputs', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /show/i }));

    expect(screen.getByLabelText(/keep together/i)).toHaveAttribute(
      'placeholder',
      'One group per line\nAlex, Sam\nPriya, Jordan, Mina',
    );
    expect(screen.getByLabelText(/avoid pairing/i)).toHaveAttribute(
      'placeholder',
      'One pair per line\nAlex, Sam\nPriya, Jordan',
    );
  });

  it('offers multiple copy-friendly result formats after generating groups', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /generate groups/i }));

    expect(await screen.findByRole('tab', { name: 'cards' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'list' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'text' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'csv' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'text' }));
    expect((screen.getByRole('textbox', { name: /text results/i }) as HTMLTextAreaElement).value).toContain('Session 1');
    expect(screen.getByRole('button', { name: /copy text/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'csv' }));
    expect((screen.getByRole('textbox', { name: /csv results/i }) as HTMLTextAreaElement).value).toContain('session,group,members');
    expect(screen.getByRole('button', { name: /copy csv/i })).toBeInTheDocument();
  });
});
