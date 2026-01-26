import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'public/pkg'] },
  {
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
      // React refresh rules
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Enforce max 500 lines per file (warn during refactoring, error after)
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      // Enforce one React component per file
      'react/no-multi-comp': ['warn', { ignoreStateless: false }],
    },
  },
)
