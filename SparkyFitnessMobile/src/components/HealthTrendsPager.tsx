import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import type { StepsDataPoint, WeightDataPoint } from '../hooks/useMeasurementsRange';
import type { HealthTrendDateRange, HealthTrendSeries } from '../types/healthTrends';
import type { SleepDataPoint } from '../types/sleep';
import SleepBarChart from './SleepBarChart';
import StepsBarChart from './StepsBarChart';
import WeightLineChart from './WeightLineChart';

type HealthTrendsPagerProps = {
  steps: HealthTrendSeries<StepsDataPoint>;
  weight: HealthTrendSeries<WeightDataPoint>;
  sleep: HealthTrendSeries<SleepDataPoint>;
  range: HealthTrendDateRange;
  weightUnit: string;
  activePage: number;
  onPageSelected: (page: number) => void;
};

type HealthTrendPage = {
  key: string;
  content: React.ReactElement;
};

const PAGER_HEIGHT = 290;

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

  if (shouldShowTrend(sleep)) {
    pages.push({
      key: 'sleep',
      content: <SleepBarChart {...sleep} range={range} />,
    });
  }

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      onPageSelected(e.nativeEvent.position);
    },
    [onPageSelected],
  );

  // Clamp so the active dot stays in range when a page disappears
  const clampedPage = Math.min(activePage, pages.length - 1);

  if (pages.length === 1) {
    return <>{pages[0].content}</>;
  }

  return (
    <>
      <PagerView
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
