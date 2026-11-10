import { createInstance } from 'i18next';
import en from '../../../public/locales/en/translation.json';
import { getTargetFallbackNotice } from '@/components/CalorieTargetBreakdown/targetFallbackNotice';
import type { AdaptiveTdeeData } from '@/components/CalorieTargetBreakdown/types';
import { adaptiveTdeeResponseSchema } from '@workspace/shared';

const i18n = createInstance();

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

const notice = (adaptiveTdeeData: AdaptiveTdeeData | null) =>
  getTargetFallbackNotice(i18n.t, {
    adaptiveTdeeData,
    fallbackVal: 2160,
    unitStr: 'kcal',
    daysOfCalorieLogs: adaptiveTdeeData?.daysOfData ?? 0,
  });

it('explains actual weight and calorie requirements in the English fallback notice', () => {
  const weightNotice = notice({
    isFallback: true,
    fallbackReason: 'Insufficient weight observations',
    weightTrendMethod: 'bounded_daily',
    estimateStatus: 'fallback',
    daysOfData: 14,
  });
  expect(weightNotice).toMatch(/2 measured days spanning 14\+ days/);
  expect(weightNotice).not.toMatch(/\{\{/);

  const calorieNotice = notice({
    isFallback: true,
    fallbackReason: 'Insufficient calorie logs',
    daysOfData: 7,
  });
  expect(calorieNotice).toMatch(/14 days with ≥200 kcal/);
});

it('explains a canonical weight fallback after learned evidence has expired', () => {
  // The server clears candidate metadata once no learned input remains. Its
  // canonical fallback explains current evidence requirements, not an expired
  // candidate whose date is no longer part of the response.
  const fallback = adaptiveTdeeResponseSchema.parse({
    tdee: 2160,
    confidence: 'LOW',
    isFallback: true,
    weightTrendMethod: 'bounded_daily',
    estimateStatus: 'fallback',
    historyReliable: false,
    activityHistoryReliable: false,
    observedWeightDays: 0,
    weightObservationSpanDays: 0,
    daysOfData: 0,
    stabilizationDays: 0,
    stabilizationWindowDays: 28,
    dailyChangeLimitKcal: 36,
    fallbackReason:
      'Insufficient weight history (need at least 2 observed weights spanning 14 days; older learned evidence gradually expires)',
    lastCalculated: '2026-11-09T00:00:00.000Z',
  });
  expect(notice(fallback)).toMatch(
    /formula baseline \(2160 kcal\).*weight evidence is insufficient.*2 measured days spanning 14\+ days/
  );
});

it('explains a missing complete observed period when current weight and calorie counts already meet the minimums', () => {
  expect(
    notice({
      isFallback: true,
      weightTrendMethod: 'bounded_daily',
      estimateStatus: 'fallback',
      observedWeightDays: 2,
      weightObservationSpanDays: 14,
      daysOfData: 14,
      fallbackReason:
        'Insufficient overlapping history: the latest observed period needs 14 qualifying calorie days',
    })
  ).toMatch(/latest weight-observation period.*14.*new completed weight day/i);
});

it.each(['learning', 'adaptive', 'held', 'fading'] as const)(
  'does not call the usable %s estimate a formula fallback',
  (estimateStatus) => {
    expect(
      notice({
        isFallback: false,
        weightTrendMethod: 'bounded_daily',
        estimateStatus,
        daysOfData: 14,
        stabilizationDays: 12,
      })
    ).toBe('');
  }
);

it('retains the automatic-goal maturity notice for an older server response', () => {
  expect(notice({ isFallback: false, daysOfData: 7 })).toMatch(
    /until 14 days.*7\/14/
  );
});
