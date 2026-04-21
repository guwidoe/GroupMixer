import type { NumberFieldProps } from './NumberField';

type PresetConfig = Pick<
  NumberFieldProps,
  'min' | 'softMax' | 'max' | 'step' | 'kind' | 'variant' | 'showSlider' | 'allowEmpty'
>;

export function withContextualMax(preset: PresetConfig, contextualMax?: number | null): PresetConfig {
  if (contextualMax == null || !Number.isFinite(contextualMax)) {
    return preset;
  }

  const resolvedMax = Math.max(preset.min ?? contextualMax, contextualMax);
  const hardMax = typeof preset.max === 'number' ? Math.min(preset.max, resolvedMax) : resolvedMax;
  const baseSoftMax = preset.softMax ?? preset.max;

  return {
    ...preset,
    max: hardMax,
    softMax: typeof baseSoftMax === 'number' ? Math.min(baseSoftMax, hardMax) : hardMax,
  };
}

export const NUMBER_FIELD_PRESETS = {
  sessionCount: { min: 1, softMax: 10, step: 1, kind: 'int' },
  groupSize: { min: 1, softMax: 12, step: 1, kind: 'int' },
  groupCount: { min: 1, softMax: 12, step: 1, kind: 'int' },
  runtimeSeconds: { min: 1, softMax: 30, step: 1, kind: 'int' },
  objectiveWeight: { min: 0, softMax: 10, step: 0.1, kind: 'float' },
  penaltyWeight: { min: 0, softMax: 100, step: 0.1, kind: 'float' },
  meetingTarget: { min: 0, softMax: 10, step: 1, kind: 'int' },
  groupCapacity: { min: 0, softMax: 20, step: 1, kind: 'int' },
  attributeTargetCount: { min: 0, softMax: 12, step: 1, kind: 'int' },
  compactInteger: { min: 0, step: 1, kind: 'int', variant: 'compact', showSlider: false },
  compactDecimal: { min: 0, step: 0.1, kind: 'float', variant: 'compact', showSlider: false },
} satisfies Record<string, PresetConfig>;
