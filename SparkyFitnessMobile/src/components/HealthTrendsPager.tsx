import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import type { HealthTrendKey } from '../constants/healthTrends';
import type {
  CaloriesTrendSeries,
  SleepTrendSeries,
} from '../hooks/useHealthTrends';
import type {
  StepsDataPoint,
  WeightDataPoint,
} from '../hooks/useMeasurementsRange';
import type {
  HealthTrendDateRange,
  HealthTrendSeries,
  HydrationDataPoint,
  Vo2MaxDataPoint,
} from '../types/healthTrends';
import CaloriesBarChart from './CaloriesBarChart';
import HydrationBarChart from './HydrationBarChart';
import SleepTimelineChart from './SleepTimelineChart';
import StepsBarChart from './StepsBarChart';
import Vo2MaxLineChart from './Vo2MaxLineChart';
import WeightLineChart from './WeightLineChart';

type HealthTrendsPagerProps = {
  steps: HealthTrendSeries<StepsDataPoint> & {
    stepsGoals?: (number | null)[];
  };
  weight: HealthTrendSeries<WeightDataPoint>;
  sleep: SleepTrendSeries;
  hydration: HealthTrendSeries<HydrationDataPoint>;
  calories: CaloriesTrendSeries;
  /** Optional so a caller that predates the trend still renders; absent reads as no data. */
  vo2max?: HealthTrendSeries<Vo2MaxDataPoint>;
  range: HealthTrendDateRange;
  weightUnit: string;
  waterUnit: string;
  /** The live target weight. `target_weight` has no per-day history anywhere in the
   * schema (a single scalar profile field), so this stays a flat line across the whole
   * window by necessity -- there is nothing to step between. */
  weightGoal?: number | null;
  /** The resolved hydration goal for each day in the window, same order as
   * `hydration.data`, stepping to a new value on the day it actually changed. */
  hydrationGoals?: (number | null)[];
  /** The resolved calorie goal for each day in the window, same order as
   * `calories.data`, stepping to a new value on the day it actually changed. */
  calorieGoals?: (number | null)[];
  visibleTrends: readonly HealthTrendKey[];
  activePage: number;
  onPageSelected: (page: number) => void;
};

type HealthTrendPage = {
  key: HealthTrendKey;
  content: React.ReactElement;
};

/**
 * Sized to the tallest page, which is Sleep: it stacks two stat tiles, a subtitle line, a
 * 150px plot, an x-axis row, and a legend, where the bar trends carry a single tooltip
 * line above their plot. The pager takes the max rather than letting the sleep card clip.
 */
const PAGER_HEIGHT = 350;

const shouldShowTrend = <TPoint,>(series: HealthTrendSeries<TPoint>): boolean =>
  series.isLoading || series.isError || series.data.length > 0;

const NO_VO2MAX: HealthTrendSeries<Vo2MaxDataPoint> = {
  data: [],
  isLoading: false,
  isError: false,
};

const HealthTrendsPager: React.FC<HealthTrendsPagerProps> = ({
  steps,
  weight,
  sleep,
  hydration,
  calories,
  vo2max = NO_VO2MAX,
  range,
  weightUnit,
  waterUnit,
  weightGoal,
  hydrationGoals,
  calorieGoals,
  visibleTrends,
  activePage,
  onPageSelected,
}) => {
  const { t } = useTranslation();

  const renderTrend: Record<HealthTrendKey, () => React.ReactElement> = {
    steps: () => <StepsBarChart {...steps} range={range} />,
    weight: () => (
      <WeightLineChart
        {...weight}
        range={range}
        unit={weightUnit}
        goal={weightGoal}
      />
    ),
    sleep: () => <SleepTimelineChart {...sleep} range={range} />,
    hydration: () => (
      <HydrationBarChart
        {...hydration}
        range={range}
        unit={waterUnit}
        goals={hydrationGoals}
      />
    ),
    calories: () => (
      <CaloriesBarChart {...calories} range={range} goals={calorieGoals} />
    ),
    vo2max: () => <Vo2MaxLineChart {...vo2max} range={range} />,
  };

  const hasTrendData: Record<HealthTrendKey, () => boolean> = {
    steps: () => shouldShowTrend(steps),
    weight: () => shouldShowTrend(weight),
    // Sleep cannot use `shouldShowTrend`: its `data` is padded to one entry per day in the
    // window, so it is never empty and the page would show for users with no sleep at all.
    sleep: () => sleep.isLoading || sleep.isError || sleep.nightsWithData > 0,
    // Hydration cannot use `shouldShowTrend` either: `useHydrationRange` zero-fills every
    // day in the window, so `data` is never empty and the page would show for users who
    // have never logged water. A day of zero is real data; a window of them is not.
    hydration: () =>
      hydration.isLoading ||
      hydration.isError ||
      hydration.data.some((point) => point.milliliters > 0),
    // Same reasoning as hydration: `useCaloriesRange` zero-fills every day too.
    calories: () =>
      calories.isLoading ||
      calories.isError ||
      calories.data.some((point) => point.calories > 0),
    // Only people whose watch or app syncs VO2 max have any, so the page waits
    // for a reading: no loading flash or error card for everyone else.
    vo2max: () => vo2max.data.length > 0,
  };

  // A trend the user configured to show but that has no data for in this window still hides itself
  const keysWithData = visibleTrends.filter((key) => hasTrendData[key]());
  // VO2 max waits for a reading, so an empty one is never the fallback page.
  const keysToRender =
    keysWithData.length > 0
      ? keysWithData
      : visibleTrends.filter((key) => key !== 'vo2max').slice(0, 1);

  const pages: HealthTrendPage[] = keysToRender.map((key) => ({
    key,
    content: renderTrend[key](),
  }));

  const pagerRef = useRef<PagerView>(null);

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      onPageSelected(e.nativeEvent.position);
    },
    [onPageSelected]
  );

  // Clamp so the active dot stays in range when a page disappears
  const clampedPage = Math.min(activePage, pages.length - 1);

  const pageKeySignature = pages.map((page) => page.key).join('|');
  const pageKeySignatureRef = useRef(pageKeySignature);
  const selectedKeyRef = useRef<string | null>(null);

  // Which trend the user is on has to be remembered by key, because an index does not
  // survive the list changing shape underneath them.
  //
  // Three ways it changes: a trend disappears (a 403 arrives) and every later index shifts
  // down; a trend appears *earlier* in the order and every later index shifts up; or the
  // user reorders or hides graphs in Dashboard Settings. The second is routine — weight
  // hides itself until the window holds a weigh-in, so logging one turns [steps, sleep]
  // into [steps, weight, sleep] on the next focus refetch. Index 1 was Sleep and is now
  // Weight, so the chart under the user silently changes to one they did not ask for.
  //
  // Re-resolving the remembered key covers all three: it finds the page's new home when it
  // moved, and falls back to clamping only when the page is genuinely gone. The result
  // goes to the native pager and to the dashboard's `chartPage`, since correcting the
  // indicator alone would leave those two disagreeing with the visible chart.
  useEffect(() => {
    const pageKeys = pageKeySignature.split('|');

    // Same pages as last time, so `activePage` is the user's own doing and defines the
    // selection — this is also the mount case, and how a swipe is recorded.
    if (pageKeySignatureRef.current === pageKeySignature) {
      selectedKeyRef.current = pageKeys[activePage] ?? null;
      return;
    }
    pageKeySignatureRef.current = pageKeySignature;

    const rememberedKey = selectedKeyRef.current;
    const rememberedIndex =
      rememberedKey === null ? -1 : pageKeys.indexOf(rememberedKey);
    const nextPage =
      rememberedIndex >= 0
        ? rememberedIndex
        : Math.min(activePage, pageKeys.length - 1);

    selectedKeyRef.current = pageKeys[nextPage] ?? null;
    if (nextPage === activePage) return;

    pagerRef.current?.setPageWithoutAnimation(nextPage);
    onPageSelected(nextPage);
  }, [activePage, pageKeySignature, onPageSelected]);

  if (pages.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-6 my-2 shadow-sm">
        <Text className="text-text-muted text-sm text-center">
          {visibleTrends.length > 0
            ? t('charts.noTrendData', {
                defaultValue: 'No data to graph yet.',
              })
            : t('charts.allTrendsHidden', {
                defaultValue:
                  'All graphs are hidden. Choose which to show in Dashboard Settings.',
              })}
        </Text>
      </View>
    );
  }

  if (pages.length === 1) {
    return <>{pages[0].content}</>;
  }

  return (
    <>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={handlePageSelected}
      >
        {pages.map((page) => (
          <View key={page.key}>{page.content}</View>
        ))}
      </PagerView>

      <View style={styles.dots}>
        {pages.map((page, index) => (
          <View
            key={page.key}
            testID={`health-trends-dot-${index}`}
            accessibilityState={{ selected: index === clampedPage }}
            className={`w-2 h-2 rounded-full mx-1 ${
              index === clampedPage ? 'bg-accent-primary' : 'bg-border'
            }`}
          />
        ))}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  pager: {
    height: PAGER_HEIGHT,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
});

export default HealthTrendsPager;
