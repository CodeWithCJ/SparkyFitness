import { useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  TooltipProps,
} from 'recharts';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseISO, subDays } from 'date-fns';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { UserCustomNutrient } from '@/types/customNutrient';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { DayData } from '@/api/Diary/foodEntryService';
import { useMiniNutritionTrendData } from '@/hooks/Foods/useFoods';

interface MiniNutritionTrendsProps {
  selectedDate: string;
  customNutrients?: UserCustomNutrient[];
}

interface ChartDetails {
  color: string;
  label: string;
  unit: string;
}

interface PayloadItem {
  name: string;
  value: number;
  dataKey: string;
  payload: DayData; // This matches the DayData type from your service
}
interface CustomTooltipProps extends TooltipProps<number, string> {
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    from: 'kcal' | 'kJ',
    to: 'kcal' | 'kJ'
  ) => number;
  customNutrients: UserCustomNutrient[];
  formatDate: (date: Date, formatStr: string) => string;
  payload?: PayloadItem[];
  label?: string;
}

const CustomTooltip = ({
  active,
  payload,
  label,
  energyUnit,
  convertEnergy,
  customNutrients,
  formatDate,
}: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const nutrientName = payload[0].dataKey as string;
    const nutrientValue = payload[0].value as number;

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
          {formatDate(parseISO(label), 'MMM dd')}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {nutrientName === 'dietary_fiber' ? 'Fiber' : nutrientName}:{' '}
          {displayValue} {unitString}
        </p>
      </div>
    );
  }
  return null;
};

interface MiniTrendChartProps {
  nutrient: string;
  details: ChartDetails;
  data: DayData[];
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    from: 'kcal' | 'kJ',
    to: 'kcal' | 'kJ'
  ) => number;
  customNutrients: UserCustomNutrient[];
  formatDate: (date: Date, formatStr: string) => string;
}

const MiniTrendChart = memo(
  ({
    nutrient,
    details,
    data,
    energyUnit,
    convertEnergy,
    customNutrients,
    formatDate,
  }: MiniTrendChartProps) => {
    const lastValue =
      (data[data.length - 1]?.[nutrient as keyof DayData] as number) || 0;

    const displayValue =
      nutrient === 'calories'
        ? Math.round(convertEnergy(lastValue, 'kcal', energyUnit)).toString()
        : formatNutrientValue(nutrient, lastValue, customNutrients);

    const unitDisplay =
      nutrient === 'calories' ? getEnergyUnitString(energyUnit) : details.unit;

    return (
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {details.label}
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: details.color }}
          >
            {displayValue} {unitDisplay}
          </span>
        </div>
        <div className="h-6 w-full bg-gray-100 dark:bg-gray-800 rounded min-w-0">
          <ResponsiveContainer width="100%" height={24} debounce={100}>
            <LineChart data={data}>
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip
                allowEscapeViewBox={{ x: true, y: true }}
                content={
                  <CustomTooltip
                    energyUnit={energyUnit}
                    convertEnergy={convertEnergy}
                    customNutrients={customNutrients}
                    formatDate={formatDate}
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
    );
  }
);

MiniTrendChart.displayName = 'MiniTrendChart';

const MiniNutritionTrends = ({
  selectedDate,
  customNutrients = [],
}: MiniNutritionTrendsProps) => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const {
    formatDateInUserTimezone,
    nutrientDisplayPreferences,
    energyUnit,
    convertEnergy,
  } = usePreferences();

  const dateRange = useMemo(() => {
    const endDate = parseISO(selectedDate);
    const startDate = subDays(endDate, 13);
    return {
      start: formatDateInUserTimezone(startDate, 'yyyy-MM-dd'),
      end: formatDateInUserTimezone(endDate, 'yyyy-MM-dd'),
    };
  }, [selectedDate, formatDateInUserTimezone]);

  const { data: chartData = [], isLoading } = useMiniNutritionTrendData(
    activeUserId || undefined,
    dateRange.start,
    dateRange.end
  );

  if (isLoading) {
    return (
      <div className="mt-4 p-3 text-center text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
        Loading charts...
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="mt-4 p-3 text-center text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
        No trend data available for the past 14 days
      </div>
    );
  }

  const summaryPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'summary' && p.platform === platform
  );

  const visibleNutrients = summaryPreferences
    ? summaryPreferences.visible_nutrients
    : ['calories', 'protein', 'carbs', 'fat', 'dietary_fiber'];

  return (
    <div className="mt-4 space-y-3">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        14-Day Nutrition Trends
      </div>

      {visibleNutrients.map((nutrient) => {
        const metadata = getNutrientMetadata(nutrient, customNutrients);
        const details: ChartDetails = {
          color: metadata.chartColor || '#808080',
          label: t(metadata.label, metadata.defaultLabel),
          unit: metadata.unit,
        };

        return (
          <MiniTrendChart
            key={nutrient}
            nutrient={nutrient}
            details={details}
            data={chartData}
            energyUnit={energyUnit}
            convertEnergy={convertEnergy}
            customNutrients={customNutrients}
            formatDate={formatDateInUserTimezone}
          />
        );
      })}
    </div>
  );
};

export default MiniNutritionTrends;
