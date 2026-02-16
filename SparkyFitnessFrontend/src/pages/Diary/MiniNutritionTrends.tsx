import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseISO, subDays } from 'date-fns';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  loadMiniNutritionTrendData,
  type DayData,
} from '@/services/miniNutritionTrendsService';

import type { UserCustomNutrient } from '@/types/customNutrient';

interface MiniNutritionTrendsProps {
  selectedDate: string;
  refreshTrigger?: number;
  customNutrients?: UserCustomNutrient[]; // Add customNutrients prop
}

import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';

const MiniNutritionTrends = ({
  selectedDate,
  refreshTrigger,
  customNutrients = [],
}: MiniNutritionTrendsProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const [chartData, setChartData] = useState<DayData[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const {
    formatDateInUserTimezone,
    nutrientDisplayPreferences,
    energyUnit,
    convertEnergy,
  } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };

  useEffect(() => {
    if (user && activeUserId) {
      loadTrendData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    activeUserId,
    selectedDate,
    formatDateInUserTimezone,
    refreshTrigger,
  ]);

  const loadTrendData = async () => {
    try {
      // Calculate date range (past 14 days from selected date for mini charts) in user's timezone
      const endDate = parseISO(selectedDate); // Parse selectedDate as a calendar date
      const startDate = subDays(endDate, 13); // 14 days total including selected date

      const startDateStr = formatDateInUserTimezone(startDate, 'yyyy-MM-dd');
      const endDateStr = formatDateInUserTimezone(endDate, 'yyyy-MM-dd');

      // Get food entries for the past 14 days - use activeUserId
      const fetchedChartData = await loadMiniNutritionTrendData(
        activeUserId,
        startDateStr,
        endDateStr
      );
      setChartData(fetchedChartData);
    } catch (error) {
      console.error('Error loading mini trend data:', error);
    }
  };

  const CustomTooltip = ({
    active,
    payload,
    label,
    energyUnit,
    convertEnergy,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const nutrientName = payload[0].dataKey;
      const nutrientValue = payload[0].value;

      const unitString =
        nutrientName === 'calories'
          ? getEnergyUnitString(energyUnit)
          : getNutrientMetadata(nutrientName, customNutrients).unit;

      const displayValue =
        nutrientName === 'calories'
          ? Math.round(
              convertEnergy(nutrientValue, 'kcal', energyUnit)
            ).toString()
          : formatNutrientValue(nutrientName, nutrientValue, customNutrients);

      return (
        <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded shadow-lg">
          <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
            {formatDateInUserTimezone(parseISO(label), 'MMM dd')}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {nutrientName === 'dietary_fiber' ? 'Fiber' : nutrientName}:{' '}
            {displayValue}
            {unitString}
          </p>
        </div>
      );
    }
    return null;
  };

  if (!isMounted || chartData.length === 0) {
    return (
      <div className="mt-4 p-3 text-center text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
        {chartData.length === 0
          ? 'No trend data available for the past 14 days'
          : 'Loading charts...'}
      </div>
    );
  }

  const summaryPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'summary' && p.platform === platform
  );
  const visibleNutrients = summaryPreferences
    ? summaryPreferences.visible_nutrients
    : ['calories', 'protein', 'carbs', 'fat', 'dietary_fiber'];

  // Memoize the chart component to prevent unnecessary re-renders of multiple charts
  const MiniTrendChart = memo(
    ({
      nutrient,
      details,
      data,
    }: {
      nutrient: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: any;
      data: DayData[];
    }) => (
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {details.label}
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: details.color }}
          >
            {nutrient === 'calories'
              ? Math.round(
                  convertEnergy(
                    (data[data.length - 1]?.[
                      nutrient as keyof DayData
                    ] as number) || 0,
                    'kcal',
                    energyUnit
                  )
                ).toString() +
                ' ' +
                getEnergyUnitString(energyUnit)
              : formatNutrientValue(
                  nutrient,
                  (data[data.length - 1]?.[
                    nutrient as keyof DayData
                  ] as number) || 0,
                  customNutrients
                ) +
                ' ' +
                details.unit}
          </span>
        </div>
        <div className="h-6 w-full bg-gray-100 dark:bg-gray-800 rounded min-w-0">
          <ResponsiveContainer
            width="100%"
            height={24}
            minWidth={0}
            minHeight={0}
            debounce={100}
          >
            <LineChart data={data}>
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip
                allowEscapeViewBox={{ x: true, y: true }}
                content={
                  <CustomTooltip
                    energyUnit={energyUnit}
                    convertEnergy={convertEnergy}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey={nutrient}
                stroke={details.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  );

  MiniTrendChart.displayName = 'MiniTrendChart';

  return (
    <div className="mt-4 space-y-3">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        14-Day Nutrition Trends
      </div>

      {visibleNutrients.map((nutrient) => {
        const metadata = getNutrientMetadata(nutrient, customNutrients);
        const details = {
          color: metadata.chartColor || '#808080', // Use centralized chartColor with fallback for custom nutrients
          label: t(metadata.label, metadata.defaultLabel),
          unit: metadata.unit,
        };

        return (
          <MiniTrendChart
            key={nutrient}
            nutrient={nutrient}
            details={details}
            data={chartData}
          />
        );
      })}
    </div>
  );
};

export default MiniNutritionTrends;
