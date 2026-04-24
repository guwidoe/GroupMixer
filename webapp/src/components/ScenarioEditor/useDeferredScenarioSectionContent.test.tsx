import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAttributeDefinition } from '../../services/scenarioAttributes';
import type { Scenario } from '../../types';
import { createSampleScenario, createSampleSolverSettings } from '../../test/fixtures';
import { useDeferredScenarioSectionContent, useDeferredScenarioSetupSummary } from './useDeferredScenarioSectionContent';

function createLargeScenario(peopleCount: number): Scenario {
  return createSampleScenario({
    people: Array.from({ length: peopleCount }, (_, index) => ({
      id: `person-${index + 1}`,
      name: `Person ${String(index + 1).padStart(4, '0')}`,
      attributes: {},
    })),
    groups: Array.from({ length: 12 }, (_, index) => ({
      id: `g${index + 1}`,
      size: 10,
    })),
    constraints: [],
    settings: createSampleSolverSettings(),
  });
}

describe('useDeferredScenarioSectionContent', () => {
  it('defers large people sections until the next task so the shell can paint first', () => {
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useDeferredScenarioSectionContent('people', createLargeScenario(250), 'scenario-1'),
    );

    expect(result.current.isContentLoading).toBe(true);
    expect(result.current.isContentReady).toBe(false);
    expect(result.current.deferredSectionLabel).toBe('people directory');

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.isContentLoading).toBe(false);
    expect(result.current.isContentReady).toBe(true);

    vi.useRealTimers();
  });

  it('keeps small sections synchronous', () => {
    const { result } = renderHook(() =>
      useDeferredScenarioSectionContent('people', createLargeScenario(12), 'scenario-1'),
    );

    expect(result.current.isContentLoading).toBe(false);
    expect(result.current.isContentReady).toBe(true);
  });

  it('does not defer lightweight setup sections even for large scenarios', () => {
    const { result } = renderHook(() =>
      useDeferredScenarioSectionContent('sessions', createLargeScenario(400), 'scenario-1'),
    );

    expect(result.current.isContentLoading).toBe(false);
    expect(result.current.isContentReady).toBe(true);
    expect(result.current.deferredSectionLabel).toBe('sessions');
  });

  it('defers large setup summary counts until the next task', () => {
    vi.useFakeTimers();

    const largeScenario = createLargeScenario(250);
    const attributeDefinitions = [createAttributeDefinition('team', ['A', 'B'], 'attr-team')];
    const { result } = renderHook(() =>
      useDeferredScenarioSetupSummary(largeScenario, attributeDefinitions, 3, 'scenario-1'),
    );

    expect(result.current.areSummaryCountsReady).toBe(false);
    expect(result.current.summaryScenario).toBeNull();
    expect(result.current.summaryAttributeDefinitions).toEqual([]);
    expect(result.current.summaryObjectiveCount).toBe(0);

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.areSummaryCountsReady).toBe(true);
    expect(result.current.summaryScenario).toEqual(largeScenario);
    expect(result.current.summaryAttributeDefinitions).toEqual(attributeDefinitions);
    expect(result.current.summaryObjectiveCount).toBe(3);

    vi.useRealTimers();
  });
});
