import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/contexts/ThemeContext';
import { EnergyCurveData } from '@/types/sleepScience';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface EnergyScheduleProps {
  data: EnergyCurveData;
}

const ZONE_COLORS: Record<string, string> = {
  peak: '#22c55e',
  rising: '#3b82f6',
  dip: '#f97316',
  'wind-down': '#9b59b6',
  sleep: '#5A778A',
};

const EnergySchedule: React.FC<EnergyScheduleProps> = ({ data }) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const chartData = useMemo(() => {
    if (!data.points) return [];
    return data.points.map((pt) => ({
      hour: pt.hour,
      energy: pt.energy,
      zone: pt.zone,
      label: `${Math.floor(pt.hour)}:${String(Math.round((pt.hour % 1) * 60)).padStart(2, '0')}`,
    }));
  }, [data.points]);

  const formatHour = (hour: number) => {
    const h = Math.floor(hour) % 24;
    return `${h}:00`;
  };

  const currentHour = new Date().getHours() + new Date().getMinutes() / 60;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{t('sleepScience.energyCurve', 'Energy Curve')}</span>
          {data.currentEnergy !== undefined && (
            <span
              className="text-sm font-normal px-2 py-0.5 rounded-full"
              style={{
                backgroundColor:
                  ZONE_COLORS[data.currentZone || 'rising'] + '20',
                color: ZONE_COLORS[data.currentZone || 'rising'],
              }}
            >
              {t('sleepScience.currentEnergy', 'Now: {{energy}}%', {
                energy: data.currentEnergy,
              })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id="energyFillGradient"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                {chartData.map((pt, index) => {
                  const offset = `${(index / (chartData.length - 1)) * 100}%`;
                  const color = ZONE_COLORS[pt.zone] || '#22c55e';
                  return (
                    <stop
                      key={`fill-${index}`}
                      offset={offset}
                      stopColor={color}
                      stopOpacity={0.2}
                    />
                  );
                })}
              </linearGradient>
              <linearGradient
                id="energyStrokeGradient"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                {chartData.map((pt, index) => {
                  const offset = `${(index / (chartData.length - 1)) * 100}%`;
                  const color = ZONE_COLORS[pt.zone] || '#22c55e';
                  return (
                    <stop
                      key={`stroke-${index}`}
                      offset={offset}
                      stopColor={color}
                      stopOpacity={1}
                    />
                  );
                })}
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
              vertical={false}
            />
            <XAxis
              dataKey="hour"
              tickFormatter={formatHour}
              stroke={isDark ? '#888' : '#666'}
              fontSize={11}
              ticks={[0, 4, 8, 12, 16, 20]}
            />
            <YAxis
              domain={[0, 100]}
              stroke={isDark ? '#888' : '#666'}
              fontSize={11}
              ticks={[0, 25, 50, 75, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#1e1e1e' : '#fff',
                border: `1px solid ${isDark ? '#333' : '#ddd'}`,
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(
                value: number,
                _name: string,
                props: { payload?: { zone?: string } }
              ) => {
                const pt = props?.payload;
                const zoneName = pt?.zone
                  ? t(`sleepScience.zone_${pt.zone}`, pt.zone)
                  : '';
                return [
                  `${value}%`,
                  `${t('sleepScience.energy', 'Energy')}${zoneName ? ` (${zoneName})` : ''}`,
                ];
              }}
              labelFormatter={(hour: number) => formatHour(hour)}
            />
            {/* Melatonin window */}
            {data.melatoninWindow && (
              <ReferenceArea
                x1={data.melatoninWindow.start}
                x2={data.melatoninWindow.end}
                fill="#9b59b6"
                fillOpacity={0.1}
                label={{
                  value: '🌙',
                  position: 'insideTop',
                  fontSize: 14,
                }}
              />
            )}
            {/* Current time marker */}
            <ReferenceLine
              x={currentHour}
              stroke={isDark ? '#fff' : '#000'}
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="energy"
              stroke="url(#energyStrokeGradient)"
              strokeWidth={3}
              fill="url(#energyFillGradient)"
              dot={false}
              activeDot={{
                r: 5,
                fill: isDark ? '#fff' : '#000',
                stroke: isDark ? '#fff' : '#000',
              }}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Zone legend */}
        <div className="flex flex-wrap gap-3 mt-3 justify-center">
          {Object.entries(ZONE_COLORS).map(([zone, color]) => (
            <div
              key={zone}
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {t(
                `sleepScience.zone_${zone}`,
                zone.charAt(0).toUpperCase() + zone.slice(1)
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default EnergySchedule;
