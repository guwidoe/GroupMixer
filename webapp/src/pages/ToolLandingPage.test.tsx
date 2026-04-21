import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAppStore } from '../store';
import { solveScenario } from '../services/solver/solveScenario';
import { createSampleScenario, createSampleSolverSettings } from '../test/fixtures';
import { buildScenarioFromDraft } from '../utils/quickSetup/buildScenarioFromDraft';
import ToolLandingPage from './ToolLandingPage';
import { getToolPageConfig, TOOL_PAGE_CONFIGS } from './toolPageConfigs';

const scrollIntoViewMock = vi.fn();

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

vi.mock('../services/solver/solveScenario', () => ({
  solveScenario: vi.fn(async ({ scenario }: { scenario: { people: Array<{ id: string }>; groups: Array<{ id: string }>; num_sessions: number } }) => ({
    selectedSettings: scenario.settings,
    runScenario: scenario,
    lastProgress: null,
    solution: {
      assignments: Array.from({ length: scenario.num_sessions }).flatMap((_, sessionIndex) =>
        scenario.people.map((person, personIndex) => ({
          person_id: person.id,
          group_id: scenario.groups[personIndex % scenario.groups.length]?.id ?? scenario.groups[0].id,
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
  scrollIntoViewMock.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock,
  });
  window.localStorage.clear();
  window.__groupmixerLandingEvents = [];
  vi.mocked(solveScenario).mockClear();
  useAppStore.getState().reset();
});

describe('ToolLandingPage SEO wiring', () => {
  it('renders route-specific copy and updates document metadata from config', async () => {
    const config = TOOL_PAGE_CONFIGS['random-team-generator'];

    render(
      <MemoryRouter initialEntries={['/random-team-generator?exp=seo-hero-test&var=B']}>
        <ToolLandingPage pageKey="random-team-generator" locale="en" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: config.hero.title,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(config.hero.eyebrow)).toBeInTheDocument();
    if (config.hero.audienceSummary) {
      expect(screen.getByText(config.hero.audienceSummary)).toBeInTheDocument();
    }
    expect(document.title).toBe(config.seo.title);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(config.seo.description);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://www.groupmixer.app/random-team-generator',
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Random Team Generator - Create Balanced Teams',
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
    expect(screen.getByRole('link', { name: /scenario editor/i })).toHaveAttribute(
      'href',
      '/app?lp=random-team-generator&exp=seo-hero-test&var=B',
    );
  });

  it('renders localized Spanish metadata and hreflang wiring on the shared landing engine', async () => {
    const config = getToolPageConfig('random-team-generator', 'es');

    render(
      <MemoryRouter initialEntries={['/es/random-team-generator?exp=seo-es-test&var=A']}>
        <ToolLandingPage pageKey="random-team-generator" locale="es" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: config.hero.title })).toBeInTheDocument();
    expect(screen.getByText(config.hero.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(config.useCasesSection.title)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
    expect(document.title).toBe(config.seo.title);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://www.groupmixer.app/es/random-team-generator',
    );
    expect(document.querySelector('link[rel="alternate"][hreflang="fr"]')?.getAttribute('href')).toBe(
      'https://www.groupmixer.app/fr/random-team-generator',
    );
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'landing_view',
          payload: expect.objectContaining({
            pageKey: 'random-team-generator',
            locale: 'es',
            landingSlug: 'random-team-generator',
          }),
        }),
      ]),
    );
    expect(screen.getByLabelText('Participantes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar grupos' })).toBeInTheDocument();
  });

  it('localizes the simplified tool and inline results view for Spanish landings', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/es/random-team-generator']}>
        <ToolLandingPage pageKey="random-team-generator" locale="es" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Generar grupos' }));

    expect(await screen.findByRole('heading', { name: 'Tus grupos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tarjetas' })).toBeInTheDocument();
    expect(screen.getByText('Sesión 1')).toBeInTheDocument();
    expect(screen.getByText(/8 personas asignadas/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Texto' }));
    expect(screen.getByRole('textbox', { name: 'Resultados en texto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar texto' })).toBeInTheDocument();
  }, 10000);

  it('renders Simplified Chinese metadata with zh-Hans language tagging on the shared landing engine', async () => {
    const config = getToolPageConfig('random-team-generator', 'zh');

    render(
      <MemoryRouter initialEntries={['/zh/random-team-generator?exp=seo-zh-test&var=C']}>
        <ToolLandingPage pageKey="random-team-generator" locale="zh" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: config.hero.title })).toBeInTheDocument();
    expect(screen.getByText(config.hero.eyebrow)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-Hans');
    expect(document.title).toBe(config.seo.title);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://www.groupmixer.app/zh/random-team-generator',
    );
    expect(document.querySelector('link[rel="alternate"][hreflang="zh-Hans"]')?.getAttribute('href')).toBe(
      'https://www.groupmixer.app/zh/random-team-generator',
    );
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'landing_view',
          payload: expect.objectContaining({
            pageKey: 'random-team-generator',
            locale: 'zh',
            landingSlug: 'random-team-generator',
          }),
        }),
      ]),
    );
  });

  it('shows a language selector in the title bar for pages with multiple live locales', async () => {
    render(
      <MemoryRouter initialEntries={['/random-team-generator']}>
        <ToolLandingPage pageKey="random-team-generator" locale="en" />
      </MemoryRouter>,
    );

    const selector = await screen.findByRole('combobox', { name: /language/i });
    expect(selector).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Deutsch' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Español' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Français' })).toBeInTheDocument();
  });

  it('generates groups locally from the landing tool without leaving the page', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /generate groups/i }));

    // Results appear inline
    expect(await screen.findByRole('heading', { name: /your groups/i })).toBeInTheDocument();
    expect(vi.mocked(solveScenario)).toHaveBeenCalledWith(
      expect.objectContaining({
        useRecommendedSettings: true,
        desiredRuntimeSeconds: 1,
      }),
    );
    expect(await screen.findByText('Group 1')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(await screen.findByText(/results generated below/i)).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalled();

    // Can transition to scenario editor
    await user.click(screen.getByRole('button', { name: /open in scenario editor/i }));

    const state = useAppStore.getState();
    expect(state.currentScenarioId).toBeTruthy();
    expect(state.scenario).not.toBeNull();
    expect(state.solution).not.toBeNull();
    expect(state.ui.activeTab).toBe('results');
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'landing_generate_clicked' }),
        expect.objectContaining({ name: 'landing_open_advanced_workspace' }),
      ]),
    );
  }, 10000);

  it('scrolls to the inline results each time groups are generated', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /generate groups/i }));
    await screen.findByRole('heading', { name: /your groups/i });
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());

    scrollIntoViewMock.mockClear();

    await user.click(screen.getByRole('button', { name: /generate groups/i }));
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
  }, 10000);

  it('creates a new advanced-editor scenario on demand and carries edits into /app', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
      </MemoryRouter>,
    );

    const textarea = screen.getByLabelText(/participants/i);
    await user.clear(textarea);
    await user.type(textarea, 'Ada\nGrace\nLinus\nMargaret');

    await user.click(screen.getAllByRole('button', { name: /scenario editor/i })[0]);

    const state = useAppStore.getState();
    expect(state.currentScenarioId).toBeTruthy();
    expect(state.scenario?.people.map((person) => person.id)).toEqual(['Ada', 'Grace', 'Linus', 'Margaret']);
    expect(state.savedScenarios[state.currentScenarioId!]?.scenario.people.map((person) => person.id)).toEqual([
      'Ada',
      'Grace',
      'Linus',
      'Margaret',
    ]);
  }, 10000);

  it('loads landing-page data into a new scenario instead of overwriting the current workspace', async () => {
    const user = userEvent.setup();

    const existingScenarioId = useAppStore.getState().syncWorkspaceDraft({
      scenario: createSampleScenario({
        people: [{ id: 'Existing', attributes: { name: 'Existing' } }],
        settings: createSampleSolverSettings(),
      }),
      scenarioName: 'Existing workspace',
    });

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
        <LocationProbe />
      </MemoryRouter>,
    );

    const textarea = screen.getByLabelText(/participants/i);
    await user.clear(textarea);
    await user.type(textarea, 'Ada\nGrace\nLinus\nMargaret');

    await user.click(screen.getAllByRole('button', { name: /scenario editor/i })[0]);

    const state = useAppStore.getState();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/app/scenario/people');
    expect(state.currentScenarioId).toBeTruthy();
    expect(state.currentScenarioId).not.toBe(existingScenarioId);
    expect(state.scenario?.people.map((person) => person.id)).toEqual(['Ada', 'Grace', 'Linus', 'Margaret']);
    expect(state.savedScenarios[existingScenarioId]?.scenario.people.map((person) => person.id)).toEqual(['Existing']);
    expect(state.ui.notifications.at(-1)).toEqual(
      expect.objectContaining({
        title: 'Landing Setup Loaded',
        message: expect.stringMatching(/restored from Scenario Manager/i),
      }),
    );
  }, 10000);

  it('reuses the current advanced-editor scenario when the setup already matches', async () => {
    const user = userEvent.setup();
    const matchingScenario = buildScenarioFromDraft({
      participantInput: 'Ada\nGrace\nLinus\nMargaret',
      groupingMode: 'groupCount',
      groupingValue: 4,
      sessions: 1,
      preset: getToolPageConfig('home', 'en').defaultPreset,
      keepTogetherInput: '',
      avoidPairingsInput: '',
      inputMode: 'names',
      balanceAttributeKey: null,
      advancedOpen: false,
      workspaceScenarioId: null,
    }).scenario;

    const existingScenarioId = useAppStore.getState().syncWorkspaceDraft({
      scenario: matchingScenario,
      scenarioName: 'Existing workspace',
    });

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
      </MemoryRouter>,
    );

    const textarea = screen.getByLabelText(/participants/i);
    await user.clear(textarea);
    await user.type(textarea, 'Ada\nGrace\nLinus\nMargaret');

    await user.click(screen.getAllByRole('button', { name: /scenario editor/i })[0]);

    const state = useAppStore.getState();
    expect(state.currentScenarioId).toBe(existingScenarioId);
    expect(Object.keys(state.savedScenarios)).toHaveLength(1);
    expect(state.ui.notifications).toEqual([]);
  }, 10000);

  it('does not silently resync landing data over a diverged editor workspace before the user opens the full editor', async () => {
    const workspaceScenarioId = useAppStore.getState().syncWorkspaceDraft({
      scenario: createSampleScenario({
        people: [
          { id: 'Ada', attributes: { name: 'Ada' } },
          { id: 'Grace', attributes: { name: 'Grace' } },
          { id: 'Linus', attributes: { name: 'Linus' } },
          { id: 'Margaret', attributes: { name: 'Margaret' } },
        ],
        settings: createSampleSolverSettings(),
      }),
      scenarioName: 'Landing draft',
    });

    window.localStorage.setItem('groupmixer.quick-setup.home.v1', JSON.stringify({
      participantInput: 'Ada\nGrace\nLinus\nMargaret',
      groupingMode: 'groupCount',
      groupingValue: 4,
      sessions: 1,
      preset: getToolPageConfig('home', 'en').defaultPreset,
      keepTogetherInput: '',
      avoidPairingsInput: '',
      inputMode: 'names',
      balanceAttributeKey: null,
      advancedOpen: false,
      workspaceScenarioId,
    }));

    useAppStore.getState().updateScenario({
      people: [
        { id: 'Edited', attributes: { name: 'Edited' } },
        { id: 'Scenario', attributes: { name: 'Scenario' } },
      ],
      groups: [{ id: 'edited-group', size: 2 }],
      constraints: [{ type: 'MustStayApart', people: ['Edited', 'Scenario'] }],
      num_sessions: 2,
    });

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
      </MemoryRouter>,
    );

    await new Promise((resolve) => window.setTimeout(resolve, 300));

    expect(useAppStore.getState().scenario?.people.map((person) => person.id)).toEqual(['Edited', 'Scenario']);
  }, 10000);

  it('creates a fresh scenario when reopening from landing even after the advanced editor diverged', async () => {
    const user = userEvent.setup();

    const existingScenarioId = useAppStore.getState().syncWorkspaceDraft({
      scenario: createSampleScenario({
        people: [{ id: 'Existing', attributes: { name: 'Existing' } }],
        settings: createSampleSolverSettings(),
      }),
      scenarioName: 'Existing workspace',
    });

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
      </MemoryRouter>,
    );

    const textarea = screen.getByLabelText(/participants/i);
    await user.clear(textarea);
    await user.type(textarea, 'Ada\nGrace\nLinus\nMargaret');

    await user.click(screen.getAllByRole('button', { name: /scenario editor/i })[0]);

    const state = useAppStore.getState();
    expect(state.currentScenarioId).toBeTruthy();
    expect(state.currentScenarioId).not.toBe(existingScenarioId);
    expect(state.scenario?.people.map((person) => person.id)).toEqual(['Ada', 'Grace', 'Linus', 'Margaret']);
    expect(state.savedScenarios[existingScenarioId]?.scenario.people.map((person) => person.id)).toEqual(['Existing']);
  }, 10000);

  it('shows the tool form above the fold with participants input and generate button', () => {
    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
      </MemoryRouter>,
    );

    // Tool form is visible immediately
    expect(screen.getByLabelText(/participants/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate groups/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate groups/i })).toHaveClass('btn-primary');
    
    expect(screen.getByText(
      'Keep certain people together or apart. Balance people by gender or other attributes. Generate multiple rounds with minimal repeats.',
    )).toBeInTheDocument();

    // Optimizer CTA fills the desktop dead-space under the hero copy
    expect(screen.getByText(/want to do better than random/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /use the full group optimizer/i })).toBeInTheDocument();
    expect(screen.getByText(/your inputs from this page come with you/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /open scenario editor/i })[0]).toHaveClass('btn-primary');
  }, 10000);

  it('uses explicit technical-page defaults without involving localized behavior', () => {
    const config = getToolPageConfig('group-assignment-optimizer', 'en');

    expect(config.mode).toBe('constraint-optimizer');
    expect(config.sectionSet).toBe('technical');
    expect(config.liveLocales).toEqual(['en']);
    expect(() => getToolPageConfig('group-assignment-optimizer', 'de')).toThrow(/not live for locale de/);

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="group-assignment-optimizer" locale="en" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Group Assignment Optimizer' })).toBeInTheDocument();
    expect((screen.getByLabelText(/participants/i) as HTMLTextAreaElement).value).toContain('name,team,role');
    expect(screen.getByRole('button', { name: /switch to names/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/balance groups by attribute/i)).toHaveValue('role');
    expect(screen.getByText(/28 attendees, groups of 4/i)).toBeInTheDocument();
  });

  it('stacks the generator above the hero content on mobile while preserving desktop order classes', () => {
    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('landing-tool-panel')).toHaveClass('order-1', 'lg:order-2');
    expect(screen.getByTestId('landing-hero')).toHaveClass('order-2', 'lg:order-1');
  });

  it('renders FAQ section for SEO', () => {
    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /frequently asked questions/i })).toBeInTheDocument();
    expect(screen.getByText(/how do i split a list of names into random groups/i)).toBeInTheDocument();
  });

  it('keeps results above the hero content on mobile once groups are generated', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToolLandingPage pageKey="home" locale="en" />
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
        <ToolLandingPage pageKey="home" locale="en" />
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
        <ToolLandingPage pageKey="home" locale="en" />
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
