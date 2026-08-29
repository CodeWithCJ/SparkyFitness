import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import type { StepsDataPoint, WeightDataPoint } from '../hooks/useMeasurementsRange';
import type { SleepTrendSeries } from '../hooks/useHealthTrends';
import type { HealthTrendDateRange, HealthTrendSeries } from '../types/healthTrends';
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
  const shouldShowSleep = sleep.isLoading || sleep.isError || sleep.nightsWithData > 0;

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
    [onPageSelected],
  );

  // Clamp so the active dot stays in range when a page disappears
  const clampedPage = Math.min(activePage, pages.length - 1);

  // Clamping the dot alone only fixes what the indicator draws. The native pager keeps the
  // index it was on and the dashboard keeps its `chartPage`, so once the removed page comes
  // back — a 403 that resolves, a weigh-in that lands — the restored selection is the stale
  // one and the highlighted dot no longer matches the visible chart. Push the clamped index
  // through both so the removal settles on a page that actually exists.
  useEffect(() => {
    if (clampedPage === activePage) return;
    pagerRef.current?.setPageWithoutAnimation(clampedPage);
    onPageSelected(clampedPage);
  }, [activePage, clampedPage, onPageSelected]);

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
