import {
  getBasePath,
  withBasePath,
  getRouterBasename,
  svgFragmentUrl,
} from '@/utils/basePath';

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

describe('svgFragmentUrl', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('resolves against the current route at root', () => {
    window.history.pushState({}, '', '/');
    expect(svgFragmentUrl('colorNutrient')).toBe('url(/#colorNutrient)');
  });

  it('resolves against the current route under a sub-path deployment', () => {
    window.history.pushState({}, '', '/sparky/diary');
    expect(svgFragmentUrl('colorNutrient')).toBe(
      'url(/sparky/diary#colorNutrient)'
    );
  });

  it('preserves the query string when present', () => {
    window.history.pushState({}, '', '/sparky/reports?range=7d');
    expect(svgFragmentUrl('energyStrokeGradient')).toBe(
      'url(/sparky/reports?range=7d#energyStrokeGradient)'
    );
  });
});
