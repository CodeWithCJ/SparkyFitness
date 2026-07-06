import { getLocalesLoadPath } from '@/i18n';

describe('getLocalesLoadPath', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('is unprefixed at root', () => {
    document.head.innerHTML = '<base href="/">';
    expect(getLocalesLoadPath()).toBe('/locales/{{lng}}/{{ns}}.json');
  });

  it('is prefixed with the sub-path when deployed at /sparky/', () => {
    document.head.innerHTML = '<base href="/sparky/">';
    expect(getLocalesLoadPath()).toBe('/sparky/locales/{{lng}}/{{ns}}.json');
  });
});
