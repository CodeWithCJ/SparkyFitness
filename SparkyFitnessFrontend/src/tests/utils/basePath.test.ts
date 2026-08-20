import { getBasePath, withBasePath, getRouterBasename } from '@/utils/basePath';

describe('getBasePath', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('returns an empty string when <base href="/">', () => {
    document.head.innerHTML = '<base href="/">';
    expect(getBasePath()).toBe('');
  });

  it('returns an empty string when there is no <base> tag', () => {
    expect(getBasePath()).toBe('');
  });

  it('returns the trimmed path for a sub-path deployment', () => {
    document.head.innerHTML = '<base href="/sparky/">';
    expect(getBasePath()).toBe('/sparky');
  });
});

describe('withBasePath', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('returns the path unchanged at root', () => {
    document.head.innerHTML = '<base href="/">';
    expect(withBasePath('/images/x.png')).toBe('/images/x.png');
  });

  it('prefixes the path at a sub-path deployment', () => {
    document.head.innerHTML = '<base href="/sparky/">';
    expect(withBasePath('/images/x.png')).toBe('/sparky/images/x.png');
  });
});

describe('getRouterBasename', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('returns "/" at root', () => {
    document.head.innerHTML = '<base href="/">';
    expect(getRouterBasename()).toBe('/');
  });

  it('returns the sub-path at a sub-path deployment', () => {
    document.head.innerHTML = '<base href="/sparky/">';
    expect(getRouterBasename()).toBe('/sparky');
  });
});
