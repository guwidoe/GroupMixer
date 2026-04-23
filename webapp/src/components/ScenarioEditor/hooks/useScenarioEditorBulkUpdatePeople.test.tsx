import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createSampleScenario } from '../../../test/fixtures';
import { createAttributeDefinition } from '../../../services/scenarioAttributes';
import { useScenarioEditorBulkUpdatePeople } from './useScenarioEditorBulkUpdatePeople';

describe('useScenarioEditorBulkUpdatePeople', () => {
  it('applies grid rows as a single scenario-document commit', () => {
    const setScenarioDocument = vi.fn();
    const addNotification = vi.fn();
    const scenario = createSampleScenario();

    const { result } = renderHook(() => useScenarioEditorBulkUpdatePeople({
      scenario,
      attributeDefinitions: [createAttributeDefinition('team', ['A', 'B'], 'attr-team')],
      addNotification,
      setScenarioDocument,
    }));

    act(() => {
      result.current.applyRows([
        { id: 'p1', attributes: { name: 'Alice', team: 'A' }, sessions: [1, 0, 1] },
        { id: 'p2', attributes: { name: 'Bob', team: 'B' } },
      ]);
    });

    expect(setScenarioDocument).toHaveBeenCalledTimes(1);
    expect(setScenarioDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario: expect.objectContaining({
          people: [
            expect.objectContaining({ id: 'p1', sessions: [0, 1] }),
            expect.objectContaining({ id: 'p2' }),
          ],
        }),
        attributeDefinitions: [
          expect.objectContaining({ id: 'attr-team', name: 'team', values: ['A', 'B'] }),
        ],
      }),
    );
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'People Updated' }),
    );
  });
});
