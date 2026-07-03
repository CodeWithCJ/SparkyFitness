// React Compiler bailout visibility — intentionally NOT part of `validate`.
//
// React Compiler is enabled for this app (app.json -> experiments.reactCompiler),
// and silently skips ("bails") any component/hook it can't prove safe to memoize.
// eslint-plugin-react-hooks v7 surfaces those bailouts as a family of granular
// rules (`refs`, `immutability`, `set-state-in-effect`, `purity`, ...).
//
// These live in their own config (run via `pnpm lint:compiler`) rather than the
// main eslint.config.js because `validate` runs `lint --max-warnings 0`: wiring
// the current backlog as warnings there would fail the gate immediately. Use
// this script to see the backlog while it's worked down; once it's near zero,
// promote these rules into eslint.config.js and flip them to "error".
//
// Note: this only catches the *semantic* bailouts (refs/state/purity/etc.). The
// syntactic ones (e.g. try/finally, value-blocks-in-try/catch) are not reported
// by the lint rule — use the babel-compiler scan for the complete picture.
const expoConfig = require('eslint-config-expo/flat');
const reactHooks = require('eslint-plugin-react-hooks');

// Reuse the TypeScript parser eslint-config-expo already registers so this config
// doesn't depend on @typescript-eslint/parser being hoisted to the package root
// (pnpm keeps it nested).
const tsParser = expoConfig.find(
  (config) => config.languageOptions?.parser?.meta?.name === 'typescript-eslint/parser',
)?.languageOptions?.parser;

if (!tsParser) {
  throw new Error(
    'eslint-config-expo/flat no longer exposes the typescript-eslint parser - it may have changed in an expo upgrade',
  );
}

// Register every plugin eslint-config-expo registers (then override react-hooks
// with v7 below) so the inline `// eslint-disable` directives scattered through
// the codebase resolve to a known rule. Without this, a directive for a rule we
// don't load (e.g. @typescript-eslint/no-empty-object-type) is reported as an
// error and breaks the run. We don't enable any of these rules — only the
// compiler rules below run.
const expoPlugins = {};
for (const config of expoConfig) {
  if (config.plugins) Object.assign(expoPlugins, config.plugins);
}

// React Compiler bailout rules from eslint-plugin-react-hooks v7. The classic
// hook rules (rules-of-hooks, exhaustive-deps) are deliberately excluded — the
// main config already owns those.
const COMPILER_RULES = [
  'static-components',
  'use-memo',
  'component-hook-factories',
  'preserve-manual-memoization',
  'incompatible-library',
  'immutability',
  'globals',
  'refs',
  'set-state-in-effect',
  'error-boundaries',
  'purity',
  'set-state-in-render',
  'unsupported-syntax',
  'config',
  'gating',
];

const rules = {};
for (const rule of COMPILER_RULES) {
  rules[`react-hooks/${rule}`] = 'warn';
}

module.exports = [
  { ignores: ['dist/*'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Override react-hooks with v7 (the version carrying the compiler rules).
    plugins: { ...expoPlugins, 'react-hooks': reactHooks },
    // The codebase's inline directives disable rules we don't enable here; don't
    // flag those as unused so the output stays scoped to compiler bailouts.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules,
  },
];
