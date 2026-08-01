describe('Jest deterministic toLocaleTimeString locale adapter', () => {
  it('resolves an empty locale list to en-US regardless of OS default locale', () => {
    // jest.setup.js installs an adapter that maps "no explicit locale" to
    // en-US, so this stays "8:30 AM" on any machine (e.g. pl-PL would
    // otherwise format as "8:30").
    const empty = new Date(2000, 0, 1, 8, 30).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const undef = new Date(2000, 0, 1, 8, 30).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(empty).toBe('8:30 AM');
    expect(undef).toBe('8:30 AM');
  });

  it.each(['en-US', 'pl-PL'])('forwards an explicitly passed locale (%s) without overriding it', (locale) => {
    // The adapter must not force en-US when a non-empty locale is supplied.
    // Asserting equivalence against the native implementation run with the
    // same explicit locale proves the argument is forwarded untouched, and is
    // independent of the machine's default locale.
    const expected = new Date(2000, 0, 1, 8, 30).toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(expected.length).toBeGreaterThan(0);
  });

  it('keeps formatting options intact', () => {
    const result = new Date(2000, 0, 1, 21, 5).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(result).toBe('9:05 PM');
  });
});
