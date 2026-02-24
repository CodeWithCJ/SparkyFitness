import type { DailyNeedData } from '@/api/SleepScience/sleepScience';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/contexts/ThemeContext';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

interface SleepNeedBreakdownProps {
  data: DailyNeedData;
}

const SleepNeedBreakdown: React.FC<SleepNeedBreakdownProps> = ({ data }) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const chartData = [
    {
      name: t('sleepScience.baseline', 'Baseline'),
      value: data.baseline,
      color: '#3b82f6',
    },
    {
      name: t('sleepScience.strain', 'Strain'),
      value: data.strainAddition,
      color: '#f97316',
    },
    {
      name: t('sleepScience.debtRecovery', 'Debt Recovery'),
      value: data.debtAddition,
      color: '#ef4444',
    },
    {
      name: t('sleepScience.naps', 'Naps'),
      value: -data.napSubtraction,
      color: '#22c55e',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>
            {t('sleepScience.sleepNeedTonight', 'Sleep Need Tonight')}
          </span>
          <span className="text-2xl font-bold text-primary">
            {data.totalNeed.toFixed(1)}h
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart
            data={chartData}
            layout="horizontal"
            margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
              horizontal={false}
            />
            <XAxis
              dataKey="name"
              stroke={isDark ? '#888' : '#666'}
              fontSize={11}
            />
            <YAxis
              stroke={isDark ? '#888' : '#666'}
              fontSize={11}
              domain={chartData.some((d) => d.value < 0) ? ['auto', 'auto'] : [0, 'auto']}
              tickFormatter={(v: number) => `${v}h`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#1e1e1e' : '#fff',
                border: `1px solid ${isDark ? '#333' : '#ddd'}`,
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number) => [`${value.toFixed(2)}h`]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Summary */}
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="capitalize">
            {t('sleepScience.method', 'Method')}: {data.method}
          </span>
          <span className="capitalize px-2 py-0.5 rounded bg-muted">
            {data.confidence}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default SleepNeedBreakdown;
