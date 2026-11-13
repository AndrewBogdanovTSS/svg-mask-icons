import babelParser from '@babel/eslint-parser'
import js from '@eslint/js'

export default [
  // Global ignores: an object with only `ignores`. Next to other keys it would
  // scope that object instead of skipping the files.
  {
    ignores: ['dist/**', 'test/.tmp/**', 'playground/.nuxt/**', 'playground/.output/**'],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: ['@babel/plugin-syntax-typescript'],
        },
      },
    },
    // Babel parses TypeScript without type information, so `no-undef` fires on
    // type-only references and `no-unused-vars` on type imports. `tsc` covers
    // both (TS2304, noUnusedLocals / noUnusedParameters); `pnpm typecheck` is
    // the gate. typescript-eslint does not support TypeScript 7 yet.
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
]
