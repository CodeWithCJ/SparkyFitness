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
  {
    selector:
      'AssignmentExpression[left.object.object.name="window"][left.object.property.name="location"][left.property.name=/^(href|pathname)$/] > Literal[value=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() or getRouterBasename() from @/utils/basePath.',
  },
  {
    selector:
      'AssignmentExpression[left.object.object.name="window"][left.object.property.name="location"][left.property.name=/^(href|pathname)$/] > TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() or getRouterBasename() from @/utils/basePath.',
  },
  {
    selector: 'NewExpression[callee.name="URL"] > Literal[value=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
  {
    selector:
      'NewExpression[callee.name="URL"] > TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
  // Narrowed to these specific key names (not "any property starting with /")
  // to avoid false-positiving on unrelated strings that happen to start with
  // a slash. Does not catch string-literal keys (e.g. {'api': '/x'}) -- an
  // identifier key is overwhelmingly the common style in this codebase.
  {
    selector:
      'Property[key.name=/^(api|url|src|href|endpoint)$/] > Literal[value=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
  {
    selector:
      'Property[key.name=/^(api|url|src|href|endpoint)$/] > TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/(?!\\/)/]',
    message:
      'Hardcoded absolute path bypasses SPARKY_BASE_PATH. Wrap it with withBasePath() from @/utils/basePath.',
  },
];
// Known gap, not solvable with no-restricted-syntax: a helper function that
// *returns* a hardcoded absolute path (e.g. the resolveFoodImageSrc-class
// bug) isn't caught by any selector above. That needs data-flow/type
// analysis -- which string literal a function returns, and where callers use
// that return value -- which plain AST pattern matching can't express.
