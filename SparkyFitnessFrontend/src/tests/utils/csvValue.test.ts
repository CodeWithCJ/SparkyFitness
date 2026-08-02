import {
  isBlank,
  toNumber,
  readNumberCell,
  round,
  weightToKg,
  lengthToCm,
  volumeToMl,
} from '@workspace/shared';

// Issue #1960: a European export ("80,2") parsed as NaN under Number() and
// the row was dropped without an error, so a 1400-row import silently saved
// only the rows whose weight happened to be a whole number. These tests are
// the contract this module exists to guarantee: a cell either parses
// correctly or is reported, and format selection only matters for the one
// genuinely ambiguous shape.
describe('toNumber', () => {
  it('is blank-safe', () => {
    expect(toNumber(undefined)).toBeUndefined();
    expect(toNumber('')).toBeUndefined();
    expect(toNumber('   ')).toBeUndefined();
  });

  it('rejects unparseable text instead of truncating it (unlike parseFloat)', () => {
    expect(toNumber('abc')).toBeUndefined();
    // parseFloat('80,2') === 80 — silently truncates at the comma. This must not.
    expect(toNumber('80,2')).not.toBe(80);
  });

  describe('single comma, no dot — always unambiguous regardless of format', () => {
    it.each([
      ['80,2', 80.2],
      ['1,5', 1.5],
      ['1,2345', 1.2345],
      ['-80,2', -80.2],
    ])('%s -> %s under either format', (input, expected) => {
      expect(toNumber(input, 'us')).toBeCloseTo(expected);
      expect(toNumber(input, 'eu')).toBeCloseTo(expected);
    });
  });

  describe('single dot, no comma — always unambiguous regardless of format', () => {
    it.each([
      ['1.5', 1.5],
      ['1.2345', 1.2345],
    ])('%s -> %s under either format', (input, expected) => {
      expect(toNumber(input, 'us')).toBeCloseTo(expected);
      expect(toNumber(input, 'eu')).toBeCloseTo(expected);
    });
  });

  describe('the genuinely ambiguous case: a single separator with an exact 3-digit trailing group', () => {
    it('"1,234" resolves by format', () => {
      expect(toNumber('1,234', 'us')).toBe(1234);
      expect(toNumber('1,234', 'eu')).toBe(1.234);
    });

    it('"1.234" resolves by format (mirror case for dot)', () => {
      expect(toNumber('1.234', 'us')).toBe(1.234);
      expect(toNumber('1.234', 'eu')).toBe(1234);
    });

    it('defaults to us format when none is supplied', () => {
      expect(toNumber('1,234')).toBe(1234);
    });
  });

  describe('repeated separator — unambiguous grouping regardless of format', () => {
    it.each([
      ['1,234,567', 1234567],
      ['1.234.567', 1234567],
      // A repeated separator can't be a decimal point (a number has at most
      // one), so this is grouping even though the trailing group isn't 3
      // digits — consistent with the rule rather than a special case.
      ['1,234,56', 123456],
    ])('%s -> %s under either format', (input, expected) => {
      expect(toNumber(input, 'us')).toBe(expected);
      expect(toNumber(input, 'eu')).toBe(expected);
    });
  });

  describe('both separators present — unambiguous by position, no format needed', () => {
    it.each([
      ['1.234,56', 1234.56], // EU-authored
      ['1,234.56', 1234.56], // US-authored
      ['1.234.567,89', 1234567.89], // EU, multiple grouping dots
      ['1,234,567.89', 1234567.89], // US, multiple grouping commas
    ])('%s -> %s regardless of the format hint', (input, expected) => {
      expect(toNumber(input, 'us')).toBeCloseTo(expected);
      expect(toNumber(input, 'eu')).toBeCloseTo(expected);
    });
  });
});

describe('readNumberCell', () => {
  it('reports a blank cell as ok with no value (metric legitimately absent)', () => {
    expect(readNumberCell(undefined)).toEqual({ ok: true });
    expect(readNumberCell('')).toEqual({ ok: true });
  });

  it('reports a valid cell as ok with the parsed value', () => {
    expect(readNumberCell('80,2')).toEqual({ ok: true, value: 80.2 });
  });

  it('reports an unparseable cell as a failure carrying the raw text, never a silent default', () => {
    expect(readNumberCell('abc')).toEqual({ ok: false, raw: 'abc' });
  });
});

describe('isBlank', () => {
  it.each([undefined, null, '', '   '])('%s is blank', (v) => {
    expect(isBlank(v)).toBe(true);
  });
  it.each(['0', '80,2', ' x '])('%s is not blank', (v) => {
    expect(isBlank(v)).toBe(false);
  });
});

describe('round', () => {
  it('rounds to 2 decimal places by default', () => {
    expect(round(1.005001)).toBe(1.01);
    expect(round(1.004999)).toBe(1);
  });
});

describe('unit converters return undefined for an unrecognized unit rather than a silent default', () => {
  it('weightToKg', () => {
    expect(weightToKg(10, 'kg')).toBe(10);
    expect(weightToKg(10, '')).toBe(10);
    expect(weightToKg(1, 'lb')).toBeCloseTo(0.45359237);
    expect(weightToKg(1, 'stone')).toBeUndefined();
  });

  it('lengthToCm', () => {
    expect(lengthToCm(10, 'cm')).toBe(10);
    expect(lengthToCm(1, 'in')).toBeCloseTo(2.54);
    expect(lengthToCm(1, 'm')).toBe(100);
    expect(lengthToCm(1, 'furlong')).toBeUndefined();
  });

  it('volumeToMl', () => {
    expect(volumeToMl(10, 'ml')).toBe(10);
    expect(volumeToMl(1, 'l')).toBe(1000);
    expect(volumeToMl(1, 'oz')).toBeCloseTo(29.5735);
    expect(volumeToMl(1, 'gallon')).toBeUndefined();
  });
});
