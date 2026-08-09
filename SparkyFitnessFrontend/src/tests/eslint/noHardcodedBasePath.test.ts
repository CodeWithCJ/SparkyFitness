import { Linter } from 'eslint';

// Polyfill structuredClone for jsdom test environment
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
}

// Kept in sync manually with the `no-restricted-syntax` entries in
// eslint.config.js. This file can't import eslint.config.js directly
// (it's a native-ESM .js file that isn't part of the ts-jest transform,
// the same class of cross-module-system problem this branch already hit
// once with better-auth/react under Jest) — so the patterns are
// duplicated here deliberately. If you change one, change the other.
const noHardcodedBasePathSelectors = [
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
];

function lintMessageCount(code: string): number {
  const linter = new Linter();
  const messages = linter.verify(code, {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-restricted-syntax': ['error', ...noHardcodedBasePathSelectors],
    },
  });
  return messages.length;
}

describe('no-hardcoded-base-path selectors', () => {
  it('flags a plain string literal src attribute', () => {
    expect(lintMessageCount('const x = <img src="/images/x.png" />;')).toBe(1);
  });

  it('flags a plain string literal href attribute', () => {
    expect(lintMessageCount('const x = <a href="/api/docs">docs</a>;')).toBe(1);
  });

  it('flags a bare single-slash href', () => {
    expect(lintMessageCount('const x = <a href="/">home</a>;')).toBe(1);
  });

  it('flags a template literal passed to fetch', () => {
    expect(lintMessageCount('fetch(`/uploads/${id}`);')).toBe(1);
  });

  it('flags a plain string literal passed to fetch', () => {
    expect(lintMessageCount("fetch('/uploads/exercises/x.png');")).toBe(1);
  });

  it('does not flag a src wrapped in withBasePath', () => {
    expect(
      lintMessageCount('const x = <img src={withBasePath("/images/x.png")} />;')
    ).toBe(0);
  });

  it('does not flag React Router Link "to" prop', () => {
    expect(lintMessageCount('const x = <Link to="/login">Login</Link>;')).toBe(
      0
    );
  });

  it('does not flag an external absolute URL', () => {
    expect(
      lintMessageCount('const x = <a href="https://example.com">ext</a>;')
    ).toBe(0);
  });

  it('does not flag a protocol-relative URL', () => {
    expect(
      lintMessageCount('const x = <img src="//cdn.example.com/x.png" />;')
    ).toBe(0);
  });

  it('does not flag fetch called with a variable', () => {
    expect(lintMessageCount('fetch(url);')).toBe(0);
  });
});
