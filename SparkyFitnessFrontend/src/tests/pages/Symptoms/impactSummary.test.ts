import { impactTimelineText, peakImpact } from '@/pages/Symptoms/impactSummary';

const base = {
  logged_at: '2026-09-29T09:00:00.000Z',
  started_at: '2026-09-29T08:00:00.000Z',
};

describe('peakImpact', () => {
  it('takes the strongest point, not the latest', () => {
    expect(
      peakImpact({
        ...base,
        impact: 'mild',
        impact_timeline: [
          { at: '2026-09-29T08:00:00.000Z', impact: 'moderate' },
          { at: '2026-09-29T10:00:00.000Z', impact: 'severe' },
          { at: '2026-09-29T12:00:00.000Z', impact: 'mild' },
        ],
      })
    ).toBe('severe');
  });

  it('is null without any impact', () => {
    expect(peakImpact({ ...base, impact: null })).toBeNull();
  });
});

describe('impactTimelineText', () => {
  it('writes every time as ISO, oldest first', () => {
    expect(
      impactTimelineText({
        ...base,
        impact: 'mild',
        impact_timeline: [
          { at: '2026-09-29T12:00:00+00:00', impact: 'mild' },
          { at: '2026-09-29T08:00:00.000Z', impact: 'moderate' },
        ],
      })
    ).toBe('2026-09-29T08:00:00.000Z moderate; 2026-09-29T12:00:00.000Z mild');
  });

  it('keeps a time it cannot parse as stored instead of failing', () => {
    // The server keeps the started_at text of the first point as sent, and
    // PostgreSQL accepts forms such as 20260625 that Date cannot parse.
    expect(
      impactTimelineText({
        ...base,
        impact: 'severe',
        impact_timeline: [
          { at: '20260625', impact: 'moderate' },
          { at: '2026-06-25T10:00:00.000Z', impact: 'severe' },
        ],
      })
    ).toBe('20260625 moderate; 2026-06-25T10:00:00.000Z severe');
  });
});
