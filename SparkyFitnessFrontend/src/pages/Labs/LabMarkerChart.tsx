import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { LabHistoryPoint } from '@workspace/shared';
import { labNumber } from './labFormat';

interface LabMarkerChartProps {
  points: LabHistoryPoint[];
  unit: string;
  low: number | null;
  high: number | null;
}

/** A marker's results over time, with the reference range as a shaded band. */
const LabMarkerChart = ({ points, unit, low, high }: LabMarkerChartProps) => {
  const { t } = useTranslation();

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {t('labs.chartEmpty', 'No results yet')}
      </p>
    );
  }

  return (
    <div className="h-64 w-full" data-testid="lab-marker-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            domain={['auto', 'auto']}
            tickFormatter={labNumber}
          />
          {(low !== null || high !== null) && (
            <ReferenceArea
              y1={low ?? undefined}
              y2={high ?? undefined}
              fill="currentColor"
              fillOpacity={0.08}
              ifOverflow="extendDomain"
            />
          )}
          <Tooltip
            formatter={(value) => [
              unit
                ? `${labNumber(Number(value))} ${unit}`
                : labNumber(Number(value)),
              t('labs.value', 'Result'),
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default LabMarkerChart;
