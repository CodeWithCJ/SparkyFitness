import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../../src/utils/numericInput';

describe('parseDecimalInput', () => {
  describe('empty / nullish', () => {
    it('returns NaN for null', () => {
      expect(parseDecimalInput(null)).toBeNaN();
    });
    it('returns NaN for undefined', () => {
      expect(parseDecimalInput(undefined)).toBeNaN();
    });
    it('returns NaN for empty string', () => {
      expect(parseDecimalInput('')).toBeNaN();
    });
    it('returns NaN for whitespace-only', () => {
      expect(parseDecimalInput('   ')).toBeNaN();
    });
  });

  describe('plain digits (no separator)', () => {
    it('parses integers', () => {
      expect(parseDecimalInput('0')).toBe(0);
      expect(parseDecimalInput('42')).toBe(42);
      expect(parseDecimalInput('1000')).toBe(1000);
    });
  });

  describe('single decimal separator', () => {
    it('handles a dot as the decimal', () => {
      expect(parseDecimalInput('1.5')).toBe(1.5);
      expect(parseDecimalInput('0.25')).toBe(0.25);
      expect(parseDecimalInput('44.5')).toBe(44.5);
    });

    it('handles a comma as the decimal (European locales)', () => {
      expect(parseDecimalInput('1,5')).toBe(1.5);
      expect(parseDecimalInput('0,25')).toBe(0.25);
      expect(parseDecimalInput('44,5')).toBe(44.5);
    });

    it('parses a trailing-separator value so typing feels natural', () => {
      expect(parseDecimalInput('1,')).toBe(1);
      expect(parseDecimalInput('1.')).toBe(1);
    });
  });

  describe('US-style thousands ("1,001.5")', () => {
    it('parses comma-thousands with dot-decimal', () => {
      expect(parseDecimalInput('1,001.5')).toBe(1001.5);
      expect(parseDecimalInput('1,234,567.89')).toBeCloseTo(1234567.89);
    });

    it('parses multi-group comma-thousands with no decimal part', () => {
      expect(parseDecimalInput('1,000,000')).toBe(1000000);
    });
  });

  describe('EU-style thousands ("1.001,5")', () => {
    it('parses dot-thousands with comma-decimal', () => {
      expect(parseDecimalInput('1.001,5')).toBe(1001.5);
      expect(parseDecimalInput('1.234.567,89')).toBeCloseTo(1234567.89);
    });

    it('parses multi-group dot-thousands with no decimal part', () => {
      expect(parseDecimalInput('1.000.000')).toBe(1000000);
    });
  });

  describe('space-separated thousands (French/Scandinavian)', () => {
    it('strips regular spaces', () => {
      expect(parseDecimalInput('1 001,5')).toBe(1001.5);
      expect(parseDecimalInput('1 000 000')).toBe(1000000);
    });

    it('strips non-breaking space (U+00A0) used by Intl.NumberFormat', () => {
      expect(parseDecimalInput('1\u00a0001,5')).toBe(1001.5);
    });

    it('strips narrow no-break space (U+202F)', () => {
      expect(parseDecimalInput('1\u202f001,5')).toBe(1001.5);
    });
  });

  describe('single-separator decimal vs thousands disambiguation', () => {
    // A naked single-group value with an exactly-3-digit trailing group
    // ("1,234" / "28.349") is genuinely ambiguous and resolves to the
    // decimal interpretation — see the comment in numericInput.ts for why.
    // Naked thousands require ≥2 groups; values with an explicit decimal
    // portion ("1,234.56" / "1.234,56") still parse as thousands.
    it('treats single-group naked values as decimals', () => {
      expect(parseDecimalInput('1,000')).toBe(1);
      expect(parseDecimalInput('1.000')).toBe(1);
      expect(parseDecimalInput('1,234')).toBe(1.234);
      expect(parseDecimalInput('1.234')).toBe(1.234);
      expect(parseDecimalInput('1,500')).toBe(1.5);
      expect(parseDecimalInput('1.500')).toBe(1.5);
      expect(parseDecimalInput('999,000')).toBe(999);
    });
    it('reads a precise decimal like 28.349 (1 oz in g) as 28.349, not 28349', () => {
      // Regression: parseDecimalInput("28.349") used to match the EU
      // thousands shape and silently return 28349, mangling Open Food
      // Facts serving sizes on save.
      expect(parseDecimalInput('28.349')).toBeCloseTo(28.349);
      expect(parseDecimalInput('100.500')).toBe(100.5);
    });
    it('keeps short trailing groups as decimals', () => {
      expect(parseDecimalInput('1,5')).toBe(1.5);
      expect(parseDecimalInput('1,50')).toBe(1.5);
      expect(parseDecimalInput('1.5')).toBe(1.5);
      expect(parseDecimalInput('1.50')).toBe(1.5);
    });
    it('keeps 4+ digit leading groups as decimals (not a valid thousand group)', () => {
      expect(parseDecimalInput('1234,567')).toBe(1234.567);
      expect(parseDecimalInput('1234.567')).toBe(1234.567);
    });
  });

  describe('invalid input', () => {
    it('returns NaN for letters', () => {
      expect(parseDecimalInput('abc')).toBeNaN();
    });
    it('returns NaN for mixed letters + digits', () => {
      expect(parseDecimalInput('1a')).toBeNaN();
    });
  });

  describe('malformed separator placement (regression for silent normalization)', () => {
    // These used to be silently "normalized" into plausible-looking numbers
    // (e.g. 1..5 → 15) which could inflate saved calories/quantities.
    it('rejects repeated dot separators', () => {
      expect(parseDecimalInput('1..5')).toBeNaN();
      expect(parseDecimalInput('..5')).toBeNaN();
      expect(parseDecimalInput('1.5.')).toBeNaN();
      expect(parseDecimalInput('1.5.2')).toBeNaN();
    });

    it('rejects repeated comma separators', () => {
      expect(parseDecimalInput('1,,5')).toBeNaN();
      expect(parseDecimalInput(',,5')).toBeNaN();
      expect(parseDecimalInput('1,5,')).toBeNaN();
    });

    it('rejects invalid thousand groupings', () => {
      expect(parseDecimalInput('1,2,3')).toBeNaN();       // groups too short
      expect(parseDecimalInput('12,34,567')).toBeNaN();   // 2-digit middle group
      expect(parseDecimalInput('1,23,456')).toBeNaN();    // 2-digit middle group
      expect(parseDecimalInput('1.2.3')).toBeNaN();
    });

    it('rejects mixed-separator garbage', () => {
      expect(parseDecimalInput('1.234,56,7')).toBeNaN();
      expect(parseDecimalInput('1,234.56.78')).toBeNaN();
      expect(parseDecimalInput('1,234,56')).toBeNaN();    // mis-grouped thousands
    });

    it('rejects lone separators', () => {
      expect(parseDecimalInput('.')).toBeNaN();
      expect(parseDecimalInput(',')).toBeNaN();
    });

    it('rejects invalid space grouping', () => {
      // Previously these collapsed via blind whitespace-stripping into
      // 123.4 / 1234 / 123 — plausible but wrong.
      expect(parseDecimalInput('1 23,4')).toBeNaN();
      expect(parseDecimalInput('12 34')).toBeNaN();
      expect(parseDecimalInput('1 2 3')).toBeNaN();
      expect(parseDecimalInput('1 234 56')).toBeNaN();      // trailing 2-digit group
      expect(parseDecimalInput('1234 567')).toBeNaN();      // 4-digit leading group
      expect(parseDecimalInput('1  234')).toBeNaN();        // double space
    });

    it('accepts outer whitespace around otherwise-valid values', () => {
      // Paste commonly introduces leading/trailing whitespace; trimming
      // outer whitespace is safe because it cannot change the structural
      // interpretation of what's between.
      expect(parseDecimalInput('  1234  ')).toBe(1234);
      expect(parseDecimalInput('\t1,234\n')).toBe(1.234);
      expect(parseDecimalInput('  1 234,5  ')).toBe(1234.5);
    });
  });
});

describe('DECIMAL_INPUT_REGEX', () => {
  it('allows empty input so users can clear the field', () => {
    expect(DECIMAL_INPUT_REGEX.test('')).toBe(true);
  });

  it('allows partial input during typing', () => {
    expect(DECIMAL_INPUT_REGEX.test('1')).toBe(true);
    expect(DECIMAL_INPUT_REGEX.test('1,')).toBe(true);
    expect(DECIMAL_INPUT_REGEX.test('1.')).toBe(true);
    expect(DECIMAL_INPUT_REGEX.test('1,5')).toBe(true);
    expect(DECIMAL_INPUT_REGEX.test('1.5')).toBe(true);
  });

  it('allows pasted thousand-separated values', () => {
    expect(DECIMAL_INPUT_REGEX.test('1,001.5')).toBe(true);
    expect(DECIMAL_INPUT_REGEX.test('1.001,5')).toBe(true);
    expect(DECIMAL_INPUT_REGEX.test('1 001,5')).toBe(true);
    expect(DECIMAL_INPUT_REGEX.test('1\u00a0001,5')).toBe(true);
  });

  it('rejects letters and other garbage', () => {
    expect(DECIMAL_INPUT_REGEX.test('abc')).toBe(false);
    expect(DECIMAL_INPUT_REGEX.test('1a')).toBe(false);
    expect(DECIMAL_INPUT_REGEX.test('1-5')).toBe(false);
  });
});
