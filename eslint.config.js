import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    // Determinismus: Im Engine-Kern sind Math.random, Date und DOM verboten.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Im Engine-Code nur den seedbaren RNG (src/engine/rng.ts) verwenden.' }],
      'no-restricted-globals': ['error', { name: 'window', message: 'Engine ohne DOM' }, { name: 'document', message: 'Engine ohne DOM' }],
      'no-restricted-imports': ['error', { patterns: ['react', 'react-dom', 'dexie', 'echarts', '**/ui/**', '**/worker/**'] }],
    },
  },
);
