import React from 'react';
import { scenarioSetupSectionRegistry } from './sectionRegistry';
import type { ScenarioEditorController } from './useScenarioEditorController';

interface ScenarioSetupSectionRendererProps {
  controller: ScenarioEditorController;
}

export function ScenarioSetupSectionRenderer({ controller }: ScenarioSetupSectionRendererProps) {
  const renderSection = Object.hasOwn(scenarioSetupSectionRegistry, controller.activeSection)
    ? scenarioSetupSectionRegistry[controller.activeSection]
    : undefined;

  return <>{typeof renderSection === 'function' ? renderSection(controller) : null}</>;
}
