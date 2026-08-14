import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      /* Fixtures and the mock implementation are reachable only through the
         client port. Without this a component can quietly import seed data and
         the prototype stops being a faithful stand-in for the API. Mirrored by a
         source scan in api/mock/fixtureIsolation.test.ts so the guard survives
         lint being skipped.

         api/mock/failure is deliberately not banned: it holds the latency and
         failure-injection config types, and the mock control panel is a
         legitimate consumer of them. The line is data and implementation, not the
         control plane. */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api/mock/seed', '**/api/mock/store', '**/api/mock/createMockClient'],
              message:
                'Import the TaskFlowClient port via useTaskFlowClient() instead. Fixtures are not component inputs.',
            },
          ],
        },
      ],

      /* §12 line 241 — no colour, size, spacing or type value in the
         implementation that is not in the token file. An inline style attribute is
         the easiest way to smuggle one in. */
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="style"]',
          message:
            'Use a CSS module class. If a value is genuinely dynamic, pass a CSS custom property from a ui/ primitive.',
        },
      ],
    },
  },
  {
    // The mock owns its own fixtures, and tests must be able to reach them.
    files: ['src/api/mock/**', '**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
)
