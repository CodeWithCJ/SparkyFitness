import { useTranslation } from 'react-i18next';
import {
  retestStatus,
  weeksSinceTest,
  type FitnessTestResponse,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FitnessTestsCardProps {
  /** Newest first. */
  tests: readonly FitnessTestResponse[];
  distanceUnit: 'km' | 'miles';
  /** Today, YYYY-MM-DD, for the retest note. */
  today: string;
  /** Formats a YYYY-MM-DD day for the list. */
  formatDay: (day: string) => string;
}

const KM_PER_MILE = 1.609344;
/** Tests listed; the mobile app has the full history. */
const LISTED_TESTS = 5;

/** Seconds as m:ss (h:mm:ss from an hour). */
const clock = (totalSeconds: number): string => {
  const whole = Math.round(totalSeconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

/**
 * The running fitness tests (5K time trial, 30-minute run, Cooper test) run in
 * the mobile app: the latest result, the training paces it set, and a short
 * history. Read-only; the tests themselves are recorded on the phone.
 */
export const FitnessTestsCard = ({
  tests,
  distanceUnit,
  today,
  formatDay,
}: FitnessTestsCardProps) => {
  const { t } = useTranslation();
  const [latest] = tests;
  if (!latest) return null;

  const perUnit = distanceUnit === 'miles' ? KM_PER_MILE : 1;
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const pace = (secondsPerKm: number) =>
    `${clock(secondsPerKm * perUnit)}/${unitLabel}`;
  const range = (min: number, max: number) =>
    `${clock(min * perUnit)}–${clock(max * perUnit)}/${unitLabel}`;

  const testName = (type: FitnessTestResponse['test_type']) => {
    switch (type) {
      case '5k':
        return t(
          'exerciseAnalytics.cardio.fitnessTests.type5k',
          '5K time trial'
        );
      case '30min':
        return t(
          'exerciseAnalytics.cardio.fitnessTests.type30min',
          '30-minute all-out run'
        );
      default:
        return t(
          'exerciseAnalytics.cardio.fitnessTests.typeCooper',
          '12-minute Cooper test'
        );
    }
  };
  const resultText = (test: FitnessTestResponse) => {
    if (test.test_type === '5k') {
      return t(
        'exerciseAnalytics.cardio.fitnessTests.result5k',
        '5K in {{time}}',
        { time: clock(test.result_value) }
      );
    }
    if (test.test_type === 'cooper') {
      const distance =
        distanceUnit === 'miles'
          ? (test.result_value / 1000 / KM_PER_MILE).toFixed(2)
          : String(Math.round(test.result_value));
      return t(
        'exerciseAnalytics.cardio.fitnessTests.resultCooper',
        '{{distance}} {{unit}} in 12 minutes',
        { distance, unit: distanceUnit === 'miles' ? 'mi' : 'm' }
      );
    }
    return t(
      'exerciseAnalytics.cardio.fitnessTests.result30min',
      '{{pace}} over the last 20 minutes',
      { pace: pace(test.result_value) }
    );
  };

  const surfaceText = (test: FitnessTestResponse) =>
    test.incline_percent === null
      ? t('exerciseAnalytics.cardio.fitnessTests.treadmill', 'Treadmill')
      : t(
          test.incline_adjusted
            ? 'exerciseAnalytics.cardio.fitnessTests.treadmillInclineAdjusted'
            : 'exerciseAnalytics.cardio.fitnessTests.treadmillIncline',
          test.incline_adjusted
            ? 'Treadmill, {{incline}}% incline, adjusted'
            : 'Treadmill, {{incline}}% incline',
          { incline: test.incline_percent }
        );

  const status = retestStatus(latest.test_date, today);
  const weeks = weeksSinceTest(latest.test_date, today);

  return (
    <Card data-testid="fitness-tests-card">
      <CardHeader>
        <CardTitle>
          {t('exerciseAnalytics.cardio.fitnessTests.title', 'Fitness tests')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-2xl font-bold">{resultText(latest)}</p>
          <p className="text-sm text-muted-foreground">
            {t(
              'exerciseAnalytics.cardio.fitnessTests.latest',
              '{{test}} on {{date}}. Threshold pace {{pace}}.',
              {
                test: testName(latest.test_type),
                date: formatDay(latest.test_date),
                pace: pace(latest.paces.thresholdSecondsPerKm),
              }
            )}
          </p>
          {latest.surface === 'indoor' && (
            <p
              className="text-sm text-muted-foreground"
              data-testid="fitness-tests-surface"
            >
              {surfaceText(latest)}
            </p>
          )}
          {status !== 'recent' && (
            <p
              className="mt-1 text-sm text-amber-600"
              data-testid="fitness-tests-retest"
            >
              {t(
                'exerciseAnalytics.cardio.fitnessTests.retest',
                'Your last test was {{weeks}} weeks ago. Retest in the mobile app to update your paces.',
                { weeks }
              )}
            </p>
          )}
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">
            {t('exerciseAnalytics.cardio.fitnessTests.paces', 'Training paces')}
          </p>
          <ul className="space-y-1 text-sm" data-testid="fitness-tests-paces">
            {[...latest.paces.zones].map((zone) => (
              <li key={zone.id} className="flex justify-between">
                <span>
                  {t(
                    `exerciseAnalytics.cardio.fitnessTests.zone.${zone.id}`,
                    zone.id.charAt(0).toUpperCase() + zone.id.slice(1)
                  )}
                </span>
                <span>{range(zone.minSecondsPerKm, zone.maxSecondsPerKm)}</span>
              </li>
            ))}
          </ul>
        </div>

        {tests.length > 1 && (
          <div>
            <p className="mb-1 text-sm font-medium">
              {t(
                'exerciseAnalytics.cardio.fitnessTests.history',
                'Earlier tests'
              )}
            </p>
            <ul
              className="space-y-1 text-sm"
              data-testid="fitness-tests-history"
            >
              {tests.slice(1, LISTED_TESTS).map((test) => (
                <li key={test.id} className="flex justify-between gap-4">
                  <span>
                    {formatDay(test.test_date)} · {testName(test.test_type)}
                    {test.surface === 'indoor' && ` · ${surfaceText(test)}`}
                  </span>
                  <span>
                    {resultText(test)} ·{' '}
                    {pace(test.paces.thresholdSecondsPerKm)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
