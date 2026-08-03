import {
  detectDecimalFormat,
  resolveDecimalFormat,
  type DecimalDetection,
} from '@workspace/shared';

// DecimalFormat has existed in csvValue.ts since the #1960 fix, but no
// caller ever passed 'eu' — this detection function is what finally makes
// the choice visible/auto-detected instead of permanently defaulting to
// 'us'. These tests pin the "only vote on genuinely unambiguous evidence"
// contract described in csvFormat.ts.
describe('detectDecimalFormat', () => {
  it('detects EU when the majority of unambiguous cells use comma-as-decimal', () => {
    const rows = [{ weight: '80,2' }, { weight: '79,7' }, { weight: '81,4' }];
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result).toEqual({ format: 'eu', confident: true, evidence: '80,2' });
  });

  it('detects US when the majority of unambiguous cells use dot-as-decimal', () => {
    const rows = [{ weight: '80.2' }, { weight: '79.7' }];
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result).toEqual({ format: 'us', confident: true, evidence: '80.2' });
  });

  it('defaults to us, not-confident, when there is no evidence at all', () => {
    const rows = [{ weight: '80' }, { weight: '' }];
    expect(detectDecimalFormat(rows, ['weight'])).toEqual({
      format: 'us',
      confident: false,
    });
  });

  it('does not let the ambiguous "1,234"-shaped cell vote either way', () => {
    // A lone comma with an exact 3-digit tail is the one case toNumber
    // itself can't resolve — it must not be treated as evidence here either,
    // or detection would just be guessing under a different name.
    const rows = [{ weight: '1,234' }, { weight: '2,345' }];
    expect(detectDecimalFormat(rows, ['weight'])).toEqual({
      format: 'us',
      confident: false,
    });
  });

  it('does not let a both-separators cell vote (it is locale-agnostic already)', () => {
    const rows = [{ weight: '1.234,56' }, { weight: '1,234.56' }];
    expect(detectDecimalFormat(rows, ['weight'])).toEqual({
      format: 'us',
      confident: false,
    });
  });

  it('only scans the declared numeric columns, not arbitrary text cells', () => {
    const rows = [{ name: 'a,b', weight: '80.5' }];
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result.format).toBe('us');
    expect(result.confident).toBe(true);
  });

  it('respects an explicit sample size cap when the caller passes one', () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      i < 250 ? { weight: '1,5' } : { weight: '1.5' }
    );
    // Only the first 200 rows (all EU-shaped) should be sampled.
    const result = detectDecimalFormat(rows, ['weight'], 200);
    expect(result.format).toBe('eu');
  });

  it('finds a single clarifying row anywhere in a large file by default (no cap)', () => {
    // 998 rows are the ambiguous "1,234"-shaped case (no vote either way);
    // exactly one row near the end unambiguously indicates EU. A capped
    // scan (the old default was 200 rows) would never reach row 999 and
    // would silently resolve as US, misparsing every ambiguous row.
    const rows = Array.from({ length: 1000 }, (_, i) => {
      if (i === 998) return { weight: '10,333' }; // 3-digit tail: ambiguous, no vote
      if (i === 999) return { weight: '80,2' }; // unambiguous EU evidence
      return { weight: '10,333' };
    });
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result).toEqual({ format: 'eu', confident: true, evidence: '80,2' });
  });
});

describe('resolveDecimalFormat', () => {
  const detection: DecimalDetection = {
    format: 'eu',
    confident: true,
    evidence: '80,2',
  };

  it('resolves "auto" to the detection result', () => {
    expect(resolveDecimalFormat('auto', detection)).toBe('eu');
  });

  it('an explicit choice always wins over detection', () => {
    expect(resolveDecimalFormat('us', detection)).toBe('us');
    expect(resolveDecimalFormat('eu', { format: 'us', confident: true })).toBe(
      'eu'
    );
  });
});
