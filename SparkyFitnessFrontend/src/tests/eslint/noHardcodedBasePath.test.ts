import { Linter } from 'eslint';
import { noHardcodedBasePathSelectors } from '../../../eslint-rules/noHardcodedBasePathSelectors.cjs';

// Polyfill structuredClone for jsdom test environment
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (<T>(obj: T): T =>
    JSON.parse(JSON.stringify(obj)) as T) as typeof structuredClone;
}

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

  it('flags a plain string literal passed to window.fetch', () => {
    expect(lintMessageCount("window.fetch('/uploads/exercises/x.png');")).toBe(
      1
    );
  });

  it('flags a template literal passed to globalThis.fetch', () => {
    expect(lintMessageCount('globalThis.fetch(`/uploads/${id}`);')).toBe(1);
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

  it('flags a hardcoded path assigned to window.location.href', () => {
    expect(lintMessageCount("window.location.href = '/';")).toBe(1);
  });

  it('flags a hardcoded path assigned to window.location.pathname', () => {
    expect(lintMessageCount("window.location.pathname = '/login';")).toBe(1);
  });

  it('flags a template literal assigned to window.location.href', () => {
    expect(lintMessageCount('window.location.href = `/reset/${token}`;')).toBe(
      1
    );
  });

  it('does not flag window.location.href assigned a non-literal', () => {
    expect(
      lintMessageCount('window.location.href = getRouterBasename();')
    ).toBe(0);
  });

  it('flags a hardcoded path passed to new URL()', () => {
    expect(lintMessageCount("new URL('/api/auth');")).toBe(1);
  });

  it('flags a template literal passed to new URL()', () => {
    expect(lintMessageCount('new URL(`/api/${path}`);')).toBe(1);
  });

  it('does not flag new URL() called with a variable', () => {
    expect(lintMessageCount('new URL(someUrl);')).toBe(0);
  });

  it('flags a hardcoded path in a url-shaped object property', () => {
    expect(lintMessageCount("const x = { api: '/api/chat/stream' };")).toBe(1);
  });

  it('flags a hardcoded path in an endpoint-shaped object property', () => {
    expect(
      lintMessageCount('const x = { endpoint: `/api/${id}/stream` };')
    ).toBe(1);
  });

  it('does not flag an external absolute URL in a url-shaped object property', () => {
    expect(
      lintMessageCount("const x = { url: 'https://example.com/settings' };")
    ).toBe(0);
  });

  it('does not flag a url-shaped object property assigned a variable', () => {
    expect(lintMessageCount('const x = { api: someEndpoint };')).toBe(0);
  });
});
