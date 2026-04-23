# NumberField Refactor Plan

## Goal

Centralize numeric-input UX in a single shared primitive so GroupMixer can evolve number-entry behavior in one place instead of scattering raw `type="number"` inputs and per-screen parsing logic across the app.

## Canonical Primitive

Create `webapp/src/components/ui/NumberField.tsx` as the app-wide numeric-input primitive.

### Default v1 interaction model

- visible label support
- **slider + editable field** as the primary layout
- optional hint / validation text
- keyboard-friendly editing
- integer and decimal modes
- fixed slider range with **Option A overflow behavior**

## Option A Overflow Behavior

For values that usually live in a common range but may occasionally exceed it:

- slider range is fixed to `min..softMax`
- if the current numeric value exceeds `softMax`, the slider thumb pins to the right edge
- the editable field still shows the real value
- dragging the slider again operates only inside the original fixed slider range
- v1 does **not** auto-expand or renormalize the slider scale

This keeps the mental model simple for infrequent users:

- slider = common range
- field = precise / out-of-range entry

## Non-Goals for v1

- no hidden slider renormalization
- no drag/scrub interaction
- no silent range expansion
- no requirement that every numeric input render a slider

Compact / dense exceptions can still use the same primitive in a field-only variant.

## Proposed API

```ts
export type NumberFieldKind = 'int' | 'float';
export type NumberFieldVariant = 'default' | 'compact';

export interface NumberFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  onCommit?: (value: number | null) => void;

  id?: string;
  name?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;

  min?: number;
  softMax?: number;
  max?: number;
  step?: number;
  kind?: NumberFieldKind;
  allowEmpty?: boolean;

  disabled?: boolean;
  required?: boolean;
  variant?: NumberFieldVariant;
  showSlider?: boolean;
  showInput?: boolean;

  className?: string;
  inputClassName?: string;
  sliderAriaLabel?: string;
}
```

## State / Interaction Rules

### Input state

The primitive owns temporary raw text state while the user edits.

- valid parsed values update external state through `onChange`
- temporary invalid text is allowed while typing
- blur / Enter commits the value
- Escape reverts to the last committed value

### Keyboard behavior

- `ArrowUp` / `ArrowDown` adjust by `step`
- `Shift + ArrowUp` / `Shift + ArrowDown` adjust by a larger step
- `Enter` commits
- `Escape` restores the last committed value

### Value normalization

- `kind='int'` rounds to whole numbers
- `kind='float'` preserves decimals based on entered precision / step
- `min` and `max` are respected when applying slider movement
- explicit validation styling should appear when draft text is invalid

### Slider behavior

- render slider when `showSlider !== false` and `softMax` is present
- slider uses `min..softMax`
- slider thumb value is `clamp(value, min, softMax)`
- if `value > softMax`, show pinned-right overflow state and retain real value in the text field

## Accessibility Rules

- accessible label via visible label or `aria-label`
- slider and field must both be keyboard reachable
- invalid state must map to `aria-invalid`
- hint / error text should use `aria-describedby`
- disabled state must be represented consistently for both field and slider

## Preset Strategy

Centralize common numeric domains in `webapp/src/components/ui/numberFieldPresets.ts`.

Initial preset candidates:

- `sessionCount`
- `groupSize`
- `groupCount`
- `runtimeSeconds`
- `objectiveWeight`
- `penaltyWeight`
- `meetingTarget`
- `groupCapacity`
- `attributeTargetCount`

These presets should encode shared semantics such as:

- `min`
- `softMax`
- `step`
- `kind`
- whether slider is shown by default

## Migration Rules

### Default migration target

When feature code needs a single numeric value, use `NumberField`.

### Expected first-wave migrations

High-visibility surfaces:

- landing quick setup group count / group size
- landing quick setup sessions
- scenario editor sessions
- solver runtime target
- objective weight

Modal / form surfaces:

- repeat encounter
- attribute balance
- pair meeting count
- should stay together / should not be together weights
- group capacity editing
- constraint form weights and counts
- generated demo data values

### Intentional exceptions

Keep exceptions documented when the hybrid slider+field pattern is a poor fit, for example:

- compact min/max range filter pairs
- dense table filter popovers
- native range visualizations that are not form-entry controls

Even exceptions should prefer the shared primitive when possible via `variant='compact'` or `showSlider={false}`.

## Guardrail

Future numeric-input work should default to `NumberField` instead of raw `type="number"` fields. A later audit pass should document intentional exceptions and add repo guidance to keep the primitive centralized.
