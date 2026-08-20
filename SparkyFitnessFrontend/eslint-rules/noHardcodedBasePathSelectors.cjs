// Shared `no-restricted-syntax` selectors flagging a hardcoded,
// domain-root-absolute path used directly as a JSX `src=`/`href=` value or as
// a `fetch(...)` argument. Imported by both eslint.config.js (the rule) and
// src/tests/eslint/noHardcodedBasePath.test.ts (the test), so the two stay in
// sync automatically instead of drifting apart. Written as CommonJS (.cjs) so
// it loads cleanly from both eslint.config.js's native ESM `import` (Node
// synthesizes named exports from `exports.x = ...` via cjs-module-lexer) and
// Jest's CommonJS test runtime (plain `require()`, no transform needed).
exports.noHardcodedBasePathSelectors = [
  {
    selector:
      'JSXAttribute[name.name=/^(src|href)$/] > Literal[value=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
  {
    selector:
      'JSXAttribute[name.name=/^(src|href)$/] > JSXExpressionContainer > Literal[value=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
  {
    selector:
      'JSXAttribute[name.name=/^(src|href)$/] > JSXExpressionContainer > TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
  {
    selector:
      'CallExpression[callee.name="fetch"] > Literal[value=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
  {
    selector:
      'CallExpression[callee.name="fetch"] > TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.property.name="fetch"] > Literal[value=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.property.name="fetch"] > TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
];
