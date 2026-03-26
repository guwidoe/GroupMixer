import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSampleScenario } from '../test/fixtures';
import {
  extractAttributesFromScenario,
  loadDemoCase,
  loadDemoCasesWithMetrics,
  mergeAttributeDefinitions,
} from './demoDataService';

type MockResponse = {
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
};

function jsonResponse(body: unknown, init: Partial<MockResponse> = {}): MockResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    ...init,
  };
}

describe('demoDataService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads, filters, and sorts demo cases from the manifest', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: ['advanced.json', 'ignored.json', 'simple.json'] }))
      .mockResolvedValueOnce(
        jsonResponse({
          demo_metadata: {
            id: 'advanced-demo',
            display_name: 'Advanced Demo',
            description: 'Advanced setup',
            category: 'Advanced',
          },
          input: {
            scenario: { people: [{ id: 'p1' }], groups: [{ id: 'g1' }], num_sessions: 3 },
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ input: { problem: { people: [], groups: [], num_sessions: 1 } } }))
      .mockResolvedValueOnce(
        jsonResponse({
          demo_metadata: {
            id: 'simple-demo',
            display_name: 'Simple Demo',
            description: 'Simple setup',
            category: 'Simple',
          },
          input: {
            scenario: { people: [{ id: 'p1' }, { id: 'p2' }], groups: [{ id: 'g1' }], num_sessions: 2 },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const demoCases = await loadDemoCasesWithMetrics();

    expect(demoCases).toEqual([
      expect.objectContaining({
        id: 'simple-demo',
        category: 'Simple',
        peopleCount: 2,
        groupCount: 1,
        sessionCount: 2,
      }),
      expect.objectContaining({
        id: 'advanced-demo',
        category: 'Advanced',
        peopleCount: 1,
        groupCount: 1,
        sessionCount: 3,
      }),
    ]);
  });

  it('supports legacy demo fixtures that still use input.problem', async () => {
    const legacyFixture = {
      demo_metadata: {
        id: 'legacy-demo',
        display_name: 'Legacy Demo',
        description: 'Legacy problem fixture',
        category: 'Simple',
      },
      input: {
        solver: {
          solver_type: 'SimulatedAnnealing',
          stop_conditions: {},
          solver_params: {
            initial_temperature: 1,
            final_temperature: 0.1,
            cooling_schedule: 'geometric',
          },
          logging: {},
        },
        problem: {
          people: [{ id: 'p1', attributes: {} }],
          groups: [{ id: 'g1', size: 4 }],
          num_sessions: 2,
        },
        constraints: [],
      },
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: ['legacy.json'] }))
      .mockResolvedValueOnce(jsonResponse(legacyFixture))
      .mockResolvedValueOnce(jsonResponse({ files: ['legacy.json'] }))
      .mockResolvedValueOnce(jsonResponse(legacyFixture))
      .mockResolvedValueOnce(jsonResponse(legacyFixture));
    vi.stubGlobal('fetch', fetchMock);

    const demoCases = await loadDemoCasesWithMetrics();
    const scenario = await loadDemoCase('legacy-demo');

    expect(demoCases).toEqual([
      expect.objectContaining({
        id: 'legacy-demo',
        peopleCount: 1,
        groupCount: 1,
        sessionCount: 2,
      }),
    ]);
    expect(scenario.people).toHaveLength(1);
    expect(scenario.groups).toHaveLength(1);
    expect(scenario.num_sessions).toBe(2);
  });

  it('falls back to the built-in ui demo when the selected file cannot be fetched', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: ['ui-demo.json'] }))
      .mockResolvedValueOnce(
        jsonResponse({
          demo_metadata: {
            id: 'ui-demo',
            display_name: 'UI Demo',
            description: 'Built-in fallback demo',
            category: 'Simple',
          },
          input: {
            solver: {
              solver_type: 'SimulatedAnnealing',
              stop_conditions: {},
              solver_params: {
                initial_temperature: 1,
                final_temperature: 0.1,
                cooling_schedule: 'geometric',
              },
              logging: {},
            },
            scenario: { people: [], groups: [], num_sessions: 1 },
            constraints: [],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500, statusText: 'Boom' }));
    vi.stubGlobal('fetch', fetchMock);

    const scenario = await loadDemoCase('ui-demo');

    expect(scenario.people.length).toBeGreaterThan(0);
    expect(scenario.groups.length).toBeGreaterThan(0);
    expect(scenario.constraints.length).toBeGreaterThan(0);
    expect(scenario.settings.solver_type).toBe('SimulatedAnnealing');
  });

  it('extracts non-name attributes and sorts their values', () => {
    const attributes = extractAttributesFromScenario(
      createSampleScenario({
        people: [
          { id: 'p1', attributes: { name: 'Alice', team: 'Blue', level: 'Senior' } },
          { id: 'p2', attributes: { name: 'Bob', team: 'Red', level: 'Junior' } },
          { id: 'p3', attributes: { name: 'Cara', team: 'Blue', level: 'Junior' } },
        ],
      }),
    );

    expect(attributes).toEqual([
      { key: 'team', values: ['Blue', 'Red'] },
      { key: 'level', values: ['Junior', 'Senior'] },
    ]);
  });

  it('merges attribute definitions without losing existing values', () => {
    const merged = mergeAttributeDefinitions(
      [{ key: 'team', values: ['Blue'] }, { key: 'office', values: ['Vienna'] }],
      [{ key: 'team', values: ['Red'] }, { key: 'level', values: ['Senior', 'Junior'] }],
    );

    expect(merged).toEqual([
      { key: 'level', values: ['Junior', 'Senior'] },
      { key: 'office', values: ['Vienna'] },
      { key: 'team', values: ['Blue', 'Red'] },
    ]);
  });
});
