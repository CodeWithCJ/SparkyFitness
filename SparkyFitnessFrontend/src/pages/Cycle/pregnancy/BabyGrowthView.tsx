import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BABY_DEVELOPMENT, babyWeek } from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ChevronLeft, ChevronRight, Ruler, Weight } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import WombScene from './WombScene';

interface BabyGrowthViewProps {
  currentWeek: number;
}

export default function BabyGrowthView({ currentWeek }: BabyGrowthViewProps) {
  const { t } = useTranslation();
  const clampedCurrent = Math.min(40, Math.max(4, currentWeek || 4));
  const [week, setWeek] = useState(clampedCurrent);
  const info = babyWeek(week);

  const chartData = useMemo(
    () =>
      BABY_DEVELOPMENT.map((b) => ({
        week: b.week,
        length: b.lengthCm,
        weight: b.weightG,
      })),
    []
  );

  if (!info) return null;

  return (
    <div className="space-y-4">
      {/* Womb scene */}
      <Card className="overflow-hidden">
        <CardContent className="pt-6">
          <WombScene
            scene={info.wombScene}
            week={week}
            size={260}
            className="mx-auto max-w-[260px]"
          />
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label={t('pregnancy.growth.prevWeek', 'Previous week')}
              disabled={week <= 4}
              onClick={() => setWeek((w) => Math.max(4, w - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[120px] text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('pregnancy.growth.week', 'Week')}
              </p>
              <p className="text-2xl font-bold tabular-nums">{week}</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label={t('pregnancy.growth.nextWeek', 'Next week')}
              disabled={week >= 40}
              onClick={() => setWeek((w) => Math.min(40, w + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 px-2">
            <Slider
              min={4}
              max={40}
              step={1}
              value={[week]}
              onValueChange={(v) => setWeek(v[0] ?? week)}
              aria-label={t('pregnancy.growth.weekScrubber', 'Week scrubber')}
            />
            {week !== clampedCurrent ? (
              <Button
                variant="link"
                size="sm"
                className="mt-1 px-0"
                onClick={() => setWeek(clampedCurrent)}
              >
                {t(
                  'pregnancy.growth.jumpToCurrent',
                  'Jump to this week ({{n}})',
                  {
                    n: clampedCurrent,
                  }
                )}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Size + comparison */}
      <Card>
        <CardContent className="py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('pregnancy.growth.sizeThisWeek', 'Baby size this week')}
          </p>
          <p className="mt-1 text-xl font-semibold">{info.comparison}</p>
          <div className="mt-3 flex gap-3">
            {info.lengthCm != null ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                {info.lengthCm} cm
              </span>
            ) : null}
            {info.weightG != null ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                <Weight className="h-4 w-4 text-muted-foreground" />
                {info.weightG} g
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Development blurbs */}
      <Card>
        <CardContent className="space-y-3 py-4 text-sm">
          <div>
            <p className="font-medium">
              {t('pregnancy.growth.baby', 'Your baby')}
            </p>
            <p className="text-muted-foreground">{info.babyBlurb}</p>
          </div>
          <div>
            <p className="font-medium">
              {t('pregnancy.growth.you', 'Your body')}
            </p>
            <p className="text-muted-foreground">{info.momBlurb}</p>
          </div>
        </CardContent>
      </Card>

      {/* Growth chart */}
      <Card>
        <CardContent className="py-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            {t('pregnancy.growth.chart', 'Growth across pregnancy')}
          </p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 5, bottom: 5, left: -18 }}
              >
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} width={40} />
                <Tooltip
                  formatter={
                    ((value: number, name: string) =>
                      name === 'length'
                        ? [`${value} cm`, 'Length']
                        : [`${value} g`, 'Weight']) as never
                  }
                  labelFormatter={(l) => `Week ${l}`}
                />
                <ReferenceLine
                  x={week}
                  stroke="#C9524E"
                  strokeDasharray="3 3"
                />
                <Line
                  type="monotone"
                  dataKey="length"
                  stroke="#4E8AA8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#E08A70"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
