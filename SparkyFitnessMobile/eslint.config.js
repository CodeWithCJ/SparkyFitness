// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// Reuse the @typescript-eslint plugin that eslint-config-expo already registers,
// so the override below lives in a config object that can resolve the rule.
const tsEslintPlugin = expoConfig.find(
  (config) => config.plugins && config.plugins["@typescript-eslint"],
).plugins["@typescript-eslint"];
const reactPlugin = expoConfig.find(
  (config) => config.plugins && config.plugins["react"],
).plugins["react"];
const importPlugin = expoConfig.find(
  (config) => config.plugins && config.plugins["import"],
).plugins["import"];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
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
