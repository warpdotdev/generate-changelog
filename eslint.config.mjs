import js from '@eslint/js'
import github from 'eslint-plugin-github'
import tseslint from 'typescript-eslint'
import jest from 'eslint-plugin-jest'
import importPlugin from 'eslint-plugin-import'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'

const githubFlat = github.getFlatConfigs()

export default [
  {
    ignores: ['dist/', 'lib/', 'node_modules/', 'coverage/', 'jest.config.js'],
  },
  js.configs.recommended,
  githubFlat.recommended,
  {
    name: 'gc/typescript',
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 9,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.es6,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@stylistic': stylistic,
      jest,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        node: {},
        typescript: {},
      },
    },
    rules: {
      'i18n-text/no-en': 'off',
      'eslint-comments/no-use': 'off',
      'import/no-namespace': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/array-type': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      camelcase: 'off',
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@stylistic/func-call-spacing': ['error', 'never'],
      '@typescript-eslint/no-array-constructor': 'error',
      '@typescript-eslint/no-empty-interface': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-extraneous-class': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-qualifier': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/prefer-for-of': 'warn',
      '@typescript-eslint/prefer-function-type': 'warn',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',
      semi: 'off',
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/type-annotation-spacing': 'error',
      '@typescript-eslint/unbound-method': 'error',
    },
  },
  {
    name: 'gc/jest',
    files: ['**/*.test.ts'],
    ...jest.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
]
