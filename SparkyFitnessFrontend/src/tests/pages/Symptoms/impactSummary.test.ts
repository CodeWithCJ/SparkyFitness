import {
  episodeImpactPoints,
  peakImpact,
} from '@/pages/Symptoms/impactSummary';

const base = {
  logged_at: '2026-09-29T09:00:00.000Z',
  started_at: '2026-09-29T08:00:00.000Z',
};

describe('episodeImpactPoints', () => {
  it('sorts the timeline by time', () => {
    expect(
      episodeImpactPoints({
        ...base,
        impact: 'mild',
        impact_timeline: [
          { at: '2026-09-29T12:00:00.000Z', impact: 'mild' },
          { at: '2026-09-29T08:00:00.000Z', impact: 'moderate' },
        ],
      })
    ).toEqual([
      { at: '2026-09-29T08:00:00.000Z', impact: 'moderate' },
      { at: '2026-09-29T12:00:00.000Z', impact: 'mild' },
    ]);
  });

  it('counts the current impact from the start when the server sends no timeline', () => {
    expect(episodeImpactPoints({ ...base, impact: 'severe' })).toEqual([
      { at: '2026-09-29T08:00:00.000Z', impact: 'severe' },
    ]);
  });

  it('is empty when no impact was recorded', () => {
    expect(
      episodeImpactPoints({ ...base, impact: null, impact_timeline: [] })
    ).toEqual([]);
  });
});

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
