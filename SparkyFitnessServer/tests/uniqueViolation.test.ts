import { describe, expect, it } from 'vitest';
import { isUniqueViolationOn } from '../utils/uniqueViolation.js';

describe('isUniqueViolationOn', () => {
  it('matches the code and the named constraint', () => {
    expect(
      isUniqueViolationOn({ code: '23505', constraint: 'idx_a' }, 'idx_a')
    ).toBe(true);
  });

  it('rejects another constraint, another code, and non-errors', () => {
    expect(
      isUniqueViolationOn({ code: '23505', constraint: 'idx_b' }, 'idx_a')
    ).toBe(false);
    expect(
      isUniqueViolationOn({ code: '23503', constraint: 'idx_a' }, 'idx_a')
    ).toBe(false);
    expect(isUniqueViolationOn(null, 'idx_a')).toBe(false);
    expect(isUniqueViolationOn('23505', 'idx_a')).toBe(false);
  });
});
