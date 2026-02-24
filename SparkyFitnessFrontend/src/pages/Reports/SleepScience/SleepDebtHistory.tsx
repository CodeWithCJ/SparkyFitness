import type { SleepDebtData } from '@/api/SleepScience/sleepScience';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/contexts/ThemeContext';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface SleepDebtHistoryProps {
  data: SleepDebtData;
}

const DEBT_COLORS: Record<string, string> = {
  surplus: '#22c55e',
  minor: '#3b82f6',
  moderate: '#f97316',
  significant: '#ef4444',
};

function getBarColor(deviation: number): string {
  if (deviation <= 0) return DEBT_COLORS.surplus;
  if (deviation < 1) return DEBT_COLORS.minor;
  if (deviation < 2) return DEBT_COLORS.moderate;
  return DEBT_COLORS.significant;
}

const TrendIcon: React.FC<{ direction: string }> = ({ direction }) => {
  const size = 14;
  switch (direction) {
    case 'improving':
      return <TrendingDown size={size} className="text-green-500" />;
    case 'worsening':
      return <TrendingUp size={size} className="text-red-500" />;
    default:
      return <Minus size={size} className="text-muted-foreground" />;
  }
};

const SleepDebtHistory: React.FC<SleepDebtHistoryProps> = ({ data }) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const chartData = useMemo(() => {
    return [...data.last14Days].reverse().map((day) => ({
      date: new Date(day.date).toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
      }),
      deviation: Math.max(0, day.deviation),
      surplus: Math.min(0, day.deviation),
      tst: day.tst,
      rawDeviation: day.deviation,
    }));
  }, [data.last14Days]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>
            {t('sleepScience.debtHistory', '14-Day Sleep Debt')}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendIcon direction={data.trend.direction} />
            <span className="capitalize">{data.trend.direction}</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke={isDark ? '#888' : '#666'}
              fontSize={10}
              interval={1}
            />
            <YAxis
              stroke={isDark ? '#888' : '#666'}
              fontSize={10}
              tickFormatter={(v: number) => `${v}h`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#1e1e1e' : '#fff',
                border: `1px solid ${isDark ? '#333' : '#ddd'}`,
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => {
                const label = name === 'deviation'
                  ? t('sleepScience.debt', 'Debt')
                  : t('sleepScience.surplus', 'Surplus');
                return [`${Math.abs(value).toFixed(1)}h`, label];
              }}
            />
            <ReferenceLine y={0} stroke={isDark ? '#555' : '#ccc'} />
            <Bar dataKey="deviation" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.rawDeviation)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default SleepDebtHistory;
