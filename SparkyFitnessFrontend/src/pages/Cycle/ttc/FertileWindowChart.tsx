import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from 'recharts';
import type { FertilityDetails } from '@/hooks/useCycle';

interface FertileWindowChartProps {
  series: FertilityDetails['fertileWindowSeries'];
}

interface TooltipPayloadItem {
  payload: {
    date: string;
    percentage: number;
    band: string;
  };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function CustomTooltip({
  active,
  payload,
  t,
}: CustomTooltipProps & { t: TFunction }) {
  if (active && payload && payload.length) {
    const data = payload[0]!.payload;
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md text-popover-foreground">
        <p className="font-semibold">{data.date}</p>
        <p className="mt-1">
          {`${t('cycle.ttc.conceptionChance', 'Conception chance')}: ${data.percentage}%`}
        </p>
        <p className="capitalize text-muted-foreground text-[10px] mt-0.5">
          {`${t(`cycle.ttc.band.${data.band}`, data.band)}`}
        </p>
      </div>
    );
  }
  return null;
}

export default function FertileWindowChart({
  series,
}: FertileWindowChartProps) {
  const { t } = useTranslation();

  if (!series || series.length === 0) return null;

  const data = series.map((item) => {
    const [, m, d] = item.date.split('-');
    const label = `${Number(m)}/${Number(d)}`;
    const probPercent = Math.round(item.probability * 100);
    return {
      ...item,
      label,
      percentage: probPercent,
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t(
            'cycle.ttc.fertileWindowChart',
            'Fertile Window Conception Chance'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-32 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                className="fill-muted-foreground"
              />
              <Tooltip
                content={<CustomTooltip t={t} />}
                cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
              />
              <Bar dataKey="percentage" radius={[6, 6, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.isToday
                        ? '#059669' // Emerald-600 for today
                        : entry.band === 'peak'
                          ? '#10b981' // Emerald-500
                          : entry.band === 'high'
                            ? '#34d399' // Emerald-400
                            : entry.band === 'medium'
                              ? '#6ee7b7' // Emerald-300
                              : '#a7f3d0' // Emerald-200 (low chance)
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-center text-[10px] text-muted-foreground">
          {t(
            'cycle.ttc.chartLegend',
            'Higher bars indicate days closer to ovulation with higher pregnancy probability.'
          )}
        </div>
      </CardContent>
    </Card>
  );
}
