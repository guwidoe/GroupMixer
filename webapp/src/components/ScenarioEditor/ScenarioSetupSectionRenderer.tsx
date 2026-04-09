import React from 'react';
import { scenarioSetupSectionRegistry } from './sectionRegistry';
import type { ScenarioEditorController } from './useScenarioEditorController';

interface ScenarioSetupSectionRendererProps {
  controller: ScenarioEditorController;
}

export function ScenarioSetupSectionRenderer({ controller }: ScenarioSetupSectionRendererProps) {
  return <>{scenarioSetupSectionRegistry[controller.activeSection]?.(controller) ?? null}</>;
}
