// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// Reuse the @typescript-eslint plugin that eslint-config-expo already registers,
// so the override below lives in a config object that can resolve the rule.
const tsEslintPlugin = expoConfig.find(
  (config) => config.plugins && config.plugins["@typescript-eslint"],
)?.plugins?.["@typescript-eslint"];
const reactPlugin = expoConfig.find(
  (config) => config.plugins && config.plugins["react"],
)?.plugins?.["react"];
const importPlugin = expoConfig.find(
  (config) => config.plugins && config.plugins["import"],
)?.plugins?.["import"];
const reactHooksPlugin = expoConfig.find(
  (config) => config.plugins && config.plugins["react-hooks"],
)?.plugins?.["react-hooks"];

if (!tsEslintPlugin || !reactPlugin || !importPlugin || !reactHooksPlugin) {
  throw new Error(
    "eslint-config-expo/flat failed to find required plugins (@typescript-eslint, react, import, react-hooks) - it may have changed in an expo upgrade",
  );
}

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Expo SDK 56's eslint-config enables eslint-plugin-react-hooks' React
    // Compiler rules. The pre-existing backlog these surfaced has been worked
    // down to zero, so they are enforced as errors (and "lint" runs with
    // --max-warnings 0). Genuine violations were fixed; the handful of
    // intentional exceptions (Reanimated shared-value writes, deliberate
    // render-time Date.now(), one-shot navigation-param effects, etc.) carry
    // scoped `// eslint-disable-next-line` comments explaining why. Use
    // `pnpm run lint:compiler` to see the wider compiler-bailout backlog.
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "react-hooks": reactHooksPlugin },
    rules: {
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/immutability": "error",
      "react-hooks/purity": "error",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.d.ts"],
    plugins: { "@typescript-eslint": tsEslintPlugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { vars: "all", args: "none", ignoreRestSiblings: true, caughtErrors: "all" },
      ],
    },
  },
  {
    files: ["__tests__/**"],
    plugins: {
      react: reactPlugin,
      "@typescript-eslint": tsEslintPlugin,
      import: importPlugin,
    },
    rules: {
      // Mock components are throwaway and don't need display names.
      "react/display-name": "off",
      // jest.mock factories are hoisted above imports and may not reference
      // out-of-scope bindings, so require() inside them is mandatory; the same
      // hoisting also forces real imports to sit below the mock calls.
      "@typescript-eslint/no-require-imports": "off",
      "import/first": "off",
    },
  }
]);
