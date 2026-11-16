import { describe, expect, it } from 'vitest';
import { adaptiveTdeeResponseSchema } from '@workspace/shared';

const legacyResponse = {
  tdee: 2600,
  confidence: 'HIGH',
  isFallback: false,
  daysOfData: 28,
  lastCalculated: '2026-11-10T08:00:00.000Z',
};

describe('adaptive expenditure quality response compatibility', () => {
  it('retains independently qualified full and activity history', () => {
    const parsed = adaptiveTdeeResponseSchema.parse({
      ...legacyResponse,
      weightTrendMethod: 'bounded_daily',
      historyReliable: true,
      activityHistoryReliable: false,
    });
    expect(parsed.historyReliable).toBe(true);
    expect(parsed.activityHistoryReliable).toBe(false);
  });

  it('keeps older server responses valid without inventing a history-quality claim', () => {
    const parsed = adaptiveTdeeResponseSchema.parse(legacyResponse);
    expect(parsed.tdee).toBe(2600);
    expect(parsed.historyReliable).toBeUndefined();
    expect(parsed.activityHistoryReliable).toBeUndefined();
  });
});
