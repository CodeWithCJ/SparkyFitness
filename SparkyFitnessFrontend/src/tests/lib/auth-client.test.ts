describe('getAuthBaseUrl', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    jest.resetModules();
  });

  it('points at /api/auth on the current origin at root', () => {
    document.head.innerHTML = '<base href="/">';
    let authClientModule: typeof import('@/lib/auth-client');
    jest.isolateModules(() => {
      authClientModule = require('@/lib/auth-client');
    });
    expect(authClientModule!.getAuthBaseUrl()).toBe(
      'http://localhost/api/auth'
    );
  });

  it('is prefixed with the sub-path when deployed at /sparky/', () => {
    document.head.innerHTML = '<base href="/sparky/">';
    let authClientModule: typeof import('@/lib/auth-client');
    jest.isolateModules(() => {
      authClientModule = require('@/lib/auth-client');
    });
    expect(authClientModule!.getAuthBaseUrl()).toBe(
      'http://localhost/sparky/api/auth'
    );
  });
});
