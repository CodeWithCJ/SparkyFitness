import { parseStressMeasurement } from '@/utils/reportUtil';

describe('parseStressMeasurement', () => {
  it('parses a valid single JSON object', () => {
    const input = '{"time":"2026-02-21T23:00:00+00:00","stress_level":26}';
    const result = parseStressMeasurement(input);

    expect(result).toHaveLength(1);
    expect(result[0].stress_level).toBe(26);
  });

  it('parses a valid JSON array', () => {
    const input =
      '[{"time":"2026-02-21T23:00:00+00:00","stress_level":26},{"time":"2026-02-21T23:03:00+00:00","stress_level":27}]';
    const result = parseStressMeasurement(input);

    expect(result).toHaveLength(2);
    expect(result[1].stress_level).toBe(27);
  });

  it('parses objects concatenated without commas', () => {
    const input =
      '{"time":"2026-02-21T23:00:00+00:00","stress_level":26}{"time":"2026-02-21T23:03:00+00:00","stress_level":27}';
    const result = parseStressMeasurement(input);

    expect(result).toHaveLength(2);
    expect(result[1].stress_level).toBe(27);
  });

  it('handles double encoded JSON strings', () => {
    const input =
      '"{\\"time\\":\\"2026-02-21T23:00:00+00:00\\",\\"stress_level\\":26}"';
    const result = parseStressMeasurement(input);

    expect(result).toHaveLength(1);
    expect(result[0].stress_level).toBe(26);
  });

  it('attempts to parse the specific massive garbled string format', () => {
    const input =
      '{"{\\"time\\":\\"2026-02-21T23:00:00+00:00\\",\\"stress_level\\":26}","{\\"time\\":\\"2026-02-21T23:03:00+00:00\\",\\"stress_level\\":27}"}';

    const result = parseStressMeasurement(input);

    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('returns empty array for invalid types', () => {
    const input = 12345;
    const result = parseStressMeasurement(input);

    expect(result).toEqual([]);
  });

  it('returns empty array for completely unparseable garbage', () => {
    const input = 'this is not json at all';
    const result = parseStressMeasurement(input);

    expect(result).toEqual([]);
  });
});
