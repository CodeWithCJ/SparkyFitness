import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

export const useHeartRateChartTheme = () => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Dynamic Theme Colors for Charts
  const chartTheme = useMemo(
    () => ({
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      tickColor: isDark ? 'rgba(255, 255, 255, 0.45)' : '#6b7280',
      axisLineColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e5e7eb',
      refLineColor: isDark
        ? 'rgba(255, 255, 255, 0.15)'
        : 'rgba(0, 0, 0, 0.12)',
      tooltipBg: isDark ? '#111827' : '#ffffff',
      tooltipBorder: isDark ? 'rgba(255, 255, 255, 0.15)' : '#e5e7eb',
      tooltipText: isDark ? '#ffffff' : '#111827',
      sleepAreaFill: isDark ? '#312e81' : '#c7d2fe',
      sleepAreaOpacity: isDark ? 0.35 : 0.45,
      sleepAreaText: isDark ? '#a5b4fc' : '#4338ca',
      workoutAreaFill: isDark ? '#ea580c' : '#fdba74',
      workoutAreaOpacity: isDark ? 0.35 : 0.4,
      workoutAreaText: isDark ? '#fb923c' : '#c2410c',
      restingLineColor: isDark ? '#22c55e' : '#16a34a',
    }),
    [isDark]
  );

  return chartTheme;
};

export type HeartRateChartTheme = ReturnType<typeof useHeartRateChartTheme>;
