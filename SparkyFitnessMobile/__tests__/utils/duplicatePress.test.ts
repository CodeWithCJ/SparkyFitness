import {
  DUPLICATE_PRESS_WINDOW_MS,
  createDuplicatePressGuard,
} from '../../src/utils/duplicatePress';

describe('createDuplicatePressGuard', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-21T03:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('allows the first press and swallows a burst behind it', () => {
    const allow = createDuplicatePressGuard();

    expect(allow('save')).toBe(true);
    expect(allow('save')).toBe(false);
    expect(allow('save')).toBe(false);
  });

  test('reopens after the window — the button never goes dead', () => {
    const allow = createDuplicatePressGuard();

    expect(allow('save')).toBe(true);
    jest.setSystemTime(Date.now() + DUPLICATE_PRESS_WINDOW_MS);
    expect(allow('save')).toBe(true);
  });

  test('keys are independent, so one screen can guard several actions', () => {
    const allow = createDuplicatePressGuard();

    expect(allow('header-save')).toBe(true);
    expect(allow('footer-save')).toBe(true);
    expect(allow('header-save')).toBe(false);
  });

  test('a backward wall-clock jump does not leave the button dead', () => {
    // Date.now is wall time: an NTP correction or the user changing the device
    // clock can move it backwards. A negative elapsed time must not read as
    // "too soon", or Save stays blocked until wall time catches up.
    const allow = createDuplicatePressGuard();

    expect(allow('save')).toBe(true);
    jest.setSystemTime(Date.now() - 60 * 60 * 1000);
    expect(allow('save')).toBe(true);
    // And the guard re-arms from the new, earlier timestamp.
    expect(allow('save')).toBe(false);
  });

  test('the window is long enough to cover a replayed tap burst', () => {
    // Queued taps off a blocked JS thread arrive within a few milliseconds;
    // a deliberate second save is far slower than this.
    expect(DUPLICATE_PRESS_WINDOW_MS).toBeGreaterThanOrEqual(500);
    expect(DUPLICATE_PRESS_WINDOW_MS).toBeLessThan(1500);
  });
});
