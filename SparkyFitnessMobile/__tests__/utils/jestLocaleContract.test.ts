describe('Jest deterministic toLocaleTimeString locale adapter', () => {
  const date = new Date(2000, 0, 1, 8, 30);
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

  it('resolves an empty locale list to en-US regardless of OS default locale', () => {
    expect(date.toLocaleTimeString([], options)).toBe('8:30 AM');
  });

  it('resolves undefined to en-US (deterministic fallback)', () => {
    expect(date.toLocaleTimeString(undefined, options)).toBe('8:30 AM');
  });

  it.each(['en-US', 'pl-PL'])(
    'matches an independent Intl formatter for explicit locale %s',
    (locale) => {
      const expected = new Intl.DateTimeFormat(locale, options).format(date);
      const actual = date.toLocaleTimeString(locale, options);
      expect(actual).toBe(expected);
    },
  );

  it('does not map null to the default en-US', () => {
    // null is an explicit (invalid) locale; the adapter must forward it to the
    // native implementation unchanged, which throws a RangeError, instead of
    // treating it like the empty default.
    expect(() => date.toLocaleTimeString(null as unknown as string)).toThrow();
  });

  it('keeps formatting options intact', () => {
    const result = new Date(2000, 0, 1, 21, 5).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(result).toBe('9:05 PM');
  });
});
