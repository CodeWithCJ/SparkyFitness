import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatWeight } from '@/utils/numberFormatting';

interface PrData {
  date: string;
  oneRM: number;
  maxWeight: number;
  maxReps: number;
}

interface PrProgressionChartProps {
  prProgressionData: PrData[];
}

export const PrProgressionChart = ({
  prProgressionData,
}: PrProgressionChartProps) => {
  const { weightUnit, formatDate } = usePreferences();

  const sortedData = useMemo(() => {
    return [...prProgressionData].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [prProgressionData]);

  if (prProgressionData.length === 0) {
    return (
      <Card>
        <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
          No PR data available for this period.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PR Progression</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sortedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(date) => formatDate(date)}
                minTickGap={30}
              />
              <YAxis
                tickFormatter={(value) => formatWeight(value, weightUnit)}
              />
              <Tooltip
                labelFormatter={(label) => formatDate(label)}
                formatter={(value: number | undefined, name?: string) => {
                  return [
                    formatWeight(value ?? 0, weightUnit),
                    name === 'oneRM' ? 'Est. 1RM' : 'Max Weight',
                  ];
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="oneRM"
                name="oneRM"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="maxWeight"
                name="maxWeight"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
