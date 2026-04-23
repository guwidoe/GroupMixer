import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAttributeDefinition } from '../../../services/scenarioAttributes';
import { createSampleScenario } from '../../../test/fixtures';
import { useScenarioEditorEntities } from './useScenarioEditorEntities';

describe('useScenarioEditorEntities', () => {
  it('updates an attribute definition through a single scenario-document commit', () => {
    const setScenarioDocument = vi.fn();
    const setScenario = vi.fn();
    const addAttributeDefinition = vi.fn();
    const addNotification = vi.fn();
    const scenario = createSampleScenario();
    const definitions = [createAttributeDefinition('team', ['A', 'B'], 'attr-team')];

    const { result } = renderHook(() => useScenarioEditorEntities({
      scenario,
      attributeDefinitions: definitions,
      addAttributeDefinition,
      setScenarioDocument,
      addNotification,
      setScenario,
    }));

    act(() => {
      result.current.setEditingAttribute(definitions[0]);
      result.current.setNewAttribute({ key: 'team', values: ['A', 'B', 'C'] });
    });

    act(() => {
      result.current.handleUpdateAttribute();
    });

    expect(setScenarioDocument).toHaveBeenCalledTimes(1);
    expect(setScenarioDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario,
        attributeDefinitions: [
          expect.objectContaining({ id: 'attr-team', name: 'team', values: ['A', 'B', 'C'] }),
        ],
      }),
    );
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Attribute Updated' }),
    );
    expect(setScenario).not.toHaveBeenCalled();
  });

  it('applies grid attribute edits through a single scenario-document commit', () => {
    const setScenarioDocument = vi.fn();
    const setScenario = vi.fn();
    const addAttributeDefinition = vi.fn();
    const addNotification = vi.fn();
    const scenario = createSampleScenario();

    const { result } = renderHook(() => useScenarioEditorEntities({
      scenario,
      attributeDefinitions: [createAttributeDefinition('team', ['A', 'B'], 'attr-team')],
      addAttributeDefinition,
      setScenarioDocument,
      addNotification,
      setScenario,
    }));

    act(() => {
      result.current.applyGridAttributes([
        createAttributeDefinition('team', ['A', 'B', 'C'], 'attr-team'),
        createAttributeDefinition('department', ['engineering'], 'attr-department'),
      ]);
    });

    expect(setScenarioDocument).toHaveBeenCalledTimes(1);
    expect(setScenarioDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario,
        attributeDefinitions: [
          expect.objectContaining({ id: 'attr-team', name: 'team', values: ['A', 'B', 'C'] }),
          expect.objectContaining({ id: 'attr-department', name: 'department', values: ['engineering'] }),
        ],
      }),
    );
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Attributes Updated' }),
    );
    expect(setScenario).not.toHaveBeenCalled();
  });
});
