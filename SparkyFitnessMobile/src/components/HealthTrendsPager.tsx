import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import PagerView from 'react-native-pager-view';
import StepsBarChart from './StepsBarChart';
import WeightLineChart from './WeightLineChart';
import type { StepsDataPoint, WeightDataPoint, StepsRange } from '../hooks/useMeasurementsRange';

type ChartPage = {
  key: string;
  content: React.ReactElement;
};

type HealthTrendsPagerProps = {
  stepsData: StepsDataPoint[];
  weightData: WeightDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: StepsRange;
  weightUnit: string;
  activePage: number;
  onPageSelected: (page: number) => void;
};

const PAGER_HEIGHT = 290;

const HealthTrendsPager: React.FC<HealthTrendsPagerProps> = ({
  stepsData,
  weightData,
  isLoading,
  isError,
  range,
  weightUnit,
  activePage,
  onPageSelected,
}) => {
  const showWeight = isLoading || isError || weightData.length > 0;

  const pages = useMemo<ChartPage[]>(() => {
    const result: ChartPage[] = [
      {
        key: 'steps',
        content: (
          <StepsBarChart
            data={stepsData}
            isLoading={isLoading}
            isError={isError}
            range={range}
          />
        ),
      },
    ];

    if (showWeight) {
      result.push({
        key: 'weight',
        content: (
          <WeightLineChart
            data={weightData}
            isLoading={isLoading}
            isError={isError}
            range={range}
            unit={weightUnit}
          />
        ),
      });
    }

    return result;
  }, [stepsData, weightData, isLoading, isError, range, weightUnit, showWeight]);

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      onPageSelected(e.nativeEvent.position);
    },
    [onPageSelected],
  );

  // Clamp active page when weight page disappears
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
