import eslintReact from '@eslint-react/eslint-plugin';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },

  // TypeScript sources (the whole tree is now .ts/.tsx).
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      '@eslint-react': eslintReact,
    },
    rules: {
      // Full react-hooks preset (includes the React Compiler rules:
      // set-state-in-effect, purity, refs, immutability, …). Everything at
      // error — the preset's own warn-level entries are promoted below.
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/incompatible-library': 'error',
      'react-hooks/unsupported-syntax': 'error',
      '@eslint-react/no-missing-key': 'error',
      '@eslint-react/no-array-index-key': 'warn',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // strictTypeChecked calibration — option tweaks, not rule removals:
      // arrow shorthand returning void (onClick={() => setX(...)}) is idiomatic React
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // numbers/booleans interpolate unambiguously
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      // async handlers on void-returning JSX attributes are safe (React ignores the promise)
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },

  prettier,
);
