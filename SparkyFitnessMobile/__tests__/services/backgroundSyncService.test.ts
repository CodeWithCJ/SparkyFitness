describe('backgroundSyncService', () => {
  test('module exports expected functions', () => {
    const { configureBackgroundSync, stopBackgroundSync, triggerManualSync } =
      require('../../src/services/backgroundSyncService');

    expect(typeof configureBackgroundSync).toBe('function');
    expect(typeof stopBackgroundSync).toBe('function');
    expect(typeof triggerManualSync).toBe('function');
  });
});
