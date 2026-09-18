import { describe, expect, it } from 'vitest';
import { truncateJsonRecords } from '../ai/tools/truncation.js';

describe('truncateJsonRecords pagination', () => {
  it('continues after the last emitted record when a page is truncated', () => {
    const data = Array.from({ length: 20 }, (_, index) => ({
      id: index,
      note: 'x'.repeat(400),
    }));
    const output = truncateJsonRecords(
      {
        data,
        total_count: 25,
        has_more: true,
        next_offset: 20,
      },
      undefined,
      'core'
    );
    const json = JSON.parse(output.split('\n\n---')[0] ?? '');

    expect(json.data.length).toBeLessThan(20);
    expect(json.next_offset).toBe(json.data.length);
    expect(json.has_more).toBe(true);
  });
});
