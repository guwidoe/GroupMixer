// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import tseslint from 'typescript-eslint'

export default tseslint.config({ ignores: ['dist', 'public/pkg', 'coverage'] }, {
  files: ['**/*.{ts,tsx}'],
  extends: [
    js.configs.recommended,
    ...tseslint.configs.recommended,
  ],
  plugins: {
    'react-hooks': reactHooks,
    'react-refresh': reactRefresh,
    react,
  },
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // React hooks rules
    ...reactHooks.configs.recommended.rules,
    // eslint-plugin-react-hooks 7 adds this as a compiler-oriented recommendation.
    // The current UI intentionally uses local draft state synced from props in many
    // places, so keep this out of the dependency-maintenance gate until those
    // components are refactored deliberately.
    'react-hooks/set-state-in-effect': 'off',
    // React refresh rules
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Enforce max 500 lines per file (warn during refactoring, error after)
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    // Enforce one React component per file
    'react/no-multi-comp': ['warn', { ignoreStateless: false }],
    // Centralize numeric inputs through the shared primitive.
    'no-restricted-syntax': [
      'error',
      {
        selector: "JSXAttribute[name.name='type'][value.type='Literal'][value.value='number']",
        message: 'Use ui/NumberField instead of raw type="number" inputs unless the file is a documented exception.',
      },
    ],
  },
}, {
  files: ['src/components/ScenarioEditor/shared/grid/components/filters/NumberRangeFilterPanel.tsx'],
  rules: {
    'no-restricted-syntax': 'off',
  },
}, storybook.configs["flat/recommended"]);
