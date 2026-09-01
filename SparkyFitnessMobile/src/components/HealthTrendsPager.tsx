import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import type {
  StepsDataPoint,
  WeightDataPoint,
} from '../hooks/useMeasurementsRange';
import type { SleepTrendSeries } from '../hooks/useHealthTrends';
import type {
  HealthTrendDateRange,
  HealthTrendSeries,
} from '../types/healthTrends';
import SleepTimelineChart from './SleepTimelineChart';
import StepsBarChart from './StepsBarChart';
import WeightLineChart from './WeightLineChart';

type HealthTrendsPagerProps = {
  steps: HealthTrendSeries<StepsDataPoint>;
  weight: HealthTrendSeries<WeightDataPoint>;
  sleep: SleepTrendSeries;
  range: HealthTrendDateRange;
  weightUnit: string;
  activePage: number;
  onPageSelected: (page: number) => void;
};

type HealthTrendPage = {
  key: string;
  content: React.ReactElement;
};

/**
 * Sized to the tallest page, which is Sleep: it stacks two stat tiles, a subtitle line, a
 * 150px plot, an x-axis row, and a legend, where Steps and Weight carry a single tooltip
 * line above their plot. The pager takes the max rather than letting the sleep card clip.
 */
const PAGER_HEIGHT = 350;

const shouldShowTrend = <TPoint,>(series: HealthTrendSeries<TPoint>): boolean =>
  series.isLoading || series.isError || series.data.length > 0;

const HealthTrendsPager: React.FC<HealthTrendsPagerProps> = ({
  steps,
  weight,
  sleep,
  range,
  weightUnit,
  activePage,
  onPageSelected,
}) => {
  const pages: HealthTrendPage[] = [
    // Steps is the default page and is always shown, so the pager can never end up with nothing to render.
    // Every other trend hides itself until it has data.
    { key: 'steps', content: <StepsBarChart {...steps} range={range} /> },
  ];

  if (shouldShowTrend(weight)) {
    pages.push({
      key: 'weight',
      content: <WeightLineChart {...weight} range={range} unit={weightUnit} />,
    });
  }

  // Sleep cannot use `shouldShowTrend`: its `data` is padded to one entry per day in the
  // window, so it is never empty and the page would show for users with no sleep at all.
  const shouldShowSleep =
    sleep.isLoading || sleep.isError || sleep.nightsWithData > 0;

  if (shouldShowSleep) {
    pages.push({
      key: 'sleep',
      content: <SleepTimelineChart {...sleep} range={range} />,
    });
  }

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
  // Two ways it changes: a trend disappears (a 403 arrives) and every later index shifts
  // down, or a trend appears *earlier* in the fixed steps/weight/sleep order and every
  // later index shifts up. The second is routine — weight hides itself until the window
  // holds a weigh-in, so logging one turns [steps, sleep] into [steps, weight, sleep] on
  // the next focus refetch. Index 1 was Sleep and is now Weight, so the chart under the
  // user silently changes to one they did not ask for.
  //
  // Re-resolving the remembered key covers both: it finds the page's new home when it
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
