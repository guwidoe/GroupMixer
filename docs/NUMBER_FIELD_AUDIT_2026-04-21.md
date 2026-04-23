# NumberField Audit — 2026-04-21

## Summary

The webapp numeric-input refactor now routes standard single-value numeric editing through the shared `NumberField` primitive.

## Audit Result

After the migration pass, remaining raw `type="number"` usage in `webapp/src` is intentionally limited to:

- `webapp/src/components/ScenarioEditor/shared/grid/components/filters/NumberRangeFilterPanel.tsx`

## Why this exception remains

`NumberRangeFilterPanel` is a compact **min/max endpoint pair** inside a dense grid-filter popover.

The default GroupMixer numeric pattern is now:
- slider + editable field
- fixed `min..softMax` slider range
- editable overflow through the text field

That pattern is a poor fit for this specific control because the user is not editing a single scalar value. They are editing a two-ended numeric filter range inside a very space-constrained popover.

For this case, paired endpoint fields remain clearer and denser than forcing two slider hybrids into the filter UI.

## Guardrail added

`webapp/eslint.config.js` now rejects new raw `type="number"` inputs in `src/**/*.{ts,tsx}` by default.

Documented exception:
- `NumberRangeFilterPanel.tsx`

## Practical rule for future work

- Use `ui/NumberField` for new numeric entry by default.
- Only keep raw numeric inputs when the UI is a documented exception with a clear reason, such as compact min/max filter endpoints.
