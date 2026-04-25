import React from 'react';
import type { AttributeDefinition, Person, Scenario } from '../../../types';
import { createDefaultSolverSettings } from '../../../services/solverUi';
import {
  reconcileScenarioAttributeDefinitions,
  reconcileScenarioAttributeState,
  resolveScenarioWorkspaceState,
} from '../../../services/scenarioAttributes';
import { PeopleDirectory } from '../sections/people/PeopleDirectory';

const VIEW_MODE_STORAGE_KEY = 'gm:scenario-setup:view-modes:v2';
const SAILING_TRIP_FIXTURE_URL = '/perf/sailing_trip_demo_real.json';

interface BenchmarkCaseFixture {
  input?: {
    problem?: {
      people?: Scenario['people'];
      groups?: Scenario['groups'];
      num_sessions?: number;
    };
    scenario?: {
      people?: Scenario['people'];
      groups?: Scenario['groups'];
      num_sessions?: number;
    };
    constraints?: Scenario['constraints'];
  };
}

function ensureListViewMode() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, 'cards' | 'list'> : {};
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, JSON.stringify({
      ...parsed,
      people: 'list',
    }));
  } catch {
    // Ignore localStorage failures; this harness still works if the user manually switches to list mode.
  }
}

function buildScenarioFromFixture(fixture: BenchmarkCaseFixture): Scenario {
  const problem = fixture.input?.scenario ?? fixture.input?.problem;
  if (!problem?.people || !problem.groups || typeof problem.num_sessions !== 'number') {
    throw new Error('Sailing Trip perf fixture is missing problem data.');
  }

  return {
    people: problem.people,
    groups: problem.groups,
    num_sessions: problem.num_sessions,
    constraints: fixture.input?.constraints ?? [],
    settings: createDefaultSolverSettings(),
  };
}

async function loadPeopleGridScenario(): Promise<{ scenario: Scenario; attributeDefinitions: AttributeDefinition[] }> {
  const response = await fetch(SAILING_TRIP_FIXTURE_URL);
  if (!response.ok) {
    throw new Error(`Failed to load Sailing Trip perf fixture: ${response.status} ${response.statusText}`);
  }

  const fixture = await response.json() as BenchmarkCaseFixture;
  return resolveScenarioWorkspaceState(buildScenarioFromFixture(fixture));
}

function createBlankPerson(people: Person[]): Person {
  const existingIds = new Set(people.map((person) => person.id));
  let nextIndex = people.length + 1;
  let nextId = `perf_person_${nextIndex}`;
  while (existingIds.has(nextId)) {
    nextIndex += 1;
    nextId = `perf_person_${nextIndex}`;
  }

  return {
    id: nextId,
    name: '',
    attributes: {},
    sessions: undefined,
  } satisfies Person;
}

export function PeopleGridPerformanceHarness() {
  const [workspace, setWorkspace] = React.useState<{ scenario: Scenario; attributeDefinitions: AttributeDefinition[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    ensureListViewMode();

    loadPeopleGridScenario()
      .then((nextWorkspace) => {
        if (!cancelled) {
          setWorkspace(nextWorkspace);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown perf harness load failure');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyPeopleRows = React.useCallback((people: Person[]) => {
    setWorkspace((current) => {
      if (!current) {
        return current;
      }

      const normalizedPeople = people.map((person) => ({
        ...person,
        name: person.name || person.id,
        sessions: Array.isArray(person.sessions) && person.sessions.length > 0
          ? Array.from(new Set(person.sessions)).sort((left, right) => left - right)
          : undefined,
      }));
      const nextScenario = reconcileScenarioAttributeState(
        {
          ...current.scenario,
          people: normalizedPeople,
        },
        current.attributeDefinitions,
      );
      const nextAttributeDefinitions = reconcileScenarioAttributeDefinitions(nextScenario, current.attributeDefinitions);
      const resolved = resolveScenarioWorkspaceState(nextScenario, nextAttributeDefinitions);

      return {
        scenario: resolved.scenario,
        attributeDefinitions: resolved.attributeDefinitions,
      };
    });
  }, []);

  const createGridPersonRow = React.useCallback(() => createBlankPerson(workspace?.scenario.people ?? []), [workspace?.scenario.people]);

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">People grid performance harness</h1>
        <p data-testid="people-grid-perf-error" className="text-sm" style={{ color: 'var(--color-error-500)' }}>
          {error}
        </p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="space-y-4" data-testid="people-grid-perf-loading">
        <h1 className="text-2xl font-semibold">People grid performance harness</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading the Sailing Trip People grid fixture…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="people-grid-perf-harness">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">People grid performance harness</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Deterministic benchmark harness for the People list grid using the exact Sailing Trip demo fixture.
        </p>
        <div
          data-testid="people-grid-perf-ready"
          data-ready="true"
          data-person-count={workspace.scenario.people.length}
          data-page-size="100"
          data-scenario-id="stretch.sailing-trip-demo-real"
          className="text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {workspace.scenario.people.length} people · {workspace.scenario.groups.length} groups · {workspace.scenario.num_sessions} sessions · page size 100
        </div>
      </div>

      <PeopleDirectory
        scenario={workspace.scenario}
        attributeDefinitions={workspace.attributeDefinitions}
        sessionsCount={workspace.scenario.num_sessions}
        onAddPerson={() => {}}
        onEditPerson={() => {}}
        onDeletePerson={() => {}}
        onApplyGridPeople={applyPeopleRows}
        createGridPersonRow={createGridPersonRow}
      />
    </div>
  );
}
