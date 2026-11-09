import { createInstance } from 'i18next';
import en from '../../../public/locales/en/translation.json';
import { getTargetFallbackNotice } from '@/components/CalorieTargetBreakdown/targetFallbackNotice';
import type { AdaptiveTdeeData } from '@/components/CalorieTargetBreakdown/types';

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
  expect(weightNotice).toMatch(/2 measured days spanning 7\+ days/);
  expect(weightNotice).not.toMatch(/\{\{/);

  const calorieNotice = notice({
    isFallback: true,
    fallbackReason: 'Insufficient calorie logs',
    daysOfData: 7,
  });
  expect(calorieNotice).toMatch(/14 days with ≥200 kcal/);
});

it('describes expired complete evidence as a return to the formula baseline', () => {
  expect(
    notice({
      isFallback: true,
      weightTrendMethod: 'bounded_daily',
      estimateStatus: 'fallback',
      candidateDate: '2026-09-01',
      daysOfData: 28,
    })
  ).toMatch(/returned to the formula baseline.*2160 kcal/);
});

it('explains a missing complete observed period when current weight and calorie counts already meet the minimums', () => {
  expect(
    notice({
      isFallback: true,
      weightTrendMethod: 'bounded_daily',
      estimateStatus: 'fallback',
      observedWeightDays: 2,
      weightObservationSpanDays: 7,
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
