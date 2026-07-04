import { useTranslation } from 'react-i18next';
import { useCycleInsights, useCycleSettings } from '@/hooks/useCycle';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertCircle,
  Calendar,
  Droplets,
  Info,
  TrendingUp,
} from 'lucide-react';
import { HORMONE_CURVES, type SharedCycle } from '@workspace/shared';
import CorrelationCards from './CorrelationCards';

interface CycleInsightsResult {
  stats: {
    avgCycleLength: number;
    medianCycleLength: number;
    cycleLengthSd: number;
    avgPeriodLength: number;
    regularity: string;
    sampleSize: number;
  };
  accuracy: {
    avgError: number;
    details: Array<{
      cycleStartDate: string;
      predictedStart: string;
      actualStart: string;
      deltaDays: number;
    }>;
  };
  matrix: Record<
    string,
    Record<string, { count: number; totalSeverity: number }>
  >;
  forecast: Record<string, string[]>;
  anomalies: Array<{
    key: string;
    severity: 'info' | 'attention';
    message: string;
  }>;
  productStats: {
    avgVolumeMl: number;
    avgProductsPerPeriod: number;
    nextPeriodNeeded: Record<string, number>;
    isHeavyBleeding: boolean;
    costWasteYearlySpend: number;
    costWastePadsCount: number;
    costWasteTamponsCount: number;
  };
  bbtSeries: Array<{ date: string; bbt: number }>;
  cycles: SharedCycle[];
}

export default function CycleInsights() {
  const { t } = useTranslation();
  const { data: insights, isLoading } = useCycleInsights();
  const { data: settings } = useCycleSettings();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
        {t('common.loading', 'Loading insights...')}
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-muted-foreground italic">
        {t('cycle.insights.noData', 'No insights data available.')}
      </div>
    );
  }

  const typedInsights = insights as unknown as CycleInsightsResult;
  const {
    stats,
    accuracy: _accuracy,
    matrix,
    forecast: _forecast,
    anomalies,
    productStats,
    bbtSeries,
    cycles = [],
  } = typedInsights;

  const completedCyclesCount = cycles.filter((c) => c.cycle_length).length;

  return (
    <div className="space-y-6">
      {/* 1. Clinical Alerts */}
      {anomalies && anomalies.length > 0 && (
        <Card className="border-red-200 bg-red-50/50 dark:border-red-950/30 dark:bg-red-950/10">
          <CardHeader className="py-3.5 px-4 flex flex-row items-center gap-2 space-y-0">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div>
              <CardTitle className="text-sm font-bold text-red-700 dark:text-red-400">
                {t('cycle.insights.clinicalAlerts', 'Clinical Health Alerts')}
              </CardTitle>
              <CardDescription className="text-xs text-red-600 dark:text-red-500">
                {t(
                  'cycle.insights.clinicalAlertsDesc',
                  'Heuristics-based observations worth discussing with a clinician.'
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2.5">
            {anomalies.map((an) => (
              <div
                key={an.key}
                className="text-xs leading-relaxed text-red-800 dark:text-red-300"
              >
                • {an.message}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Low data gate */}
      {completedCyclesCount < 2 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-3">
            <Calendar className="h-8 w-8 text-muted-foreground opacity-60" />
            <div className="space-y-1">
              <h4 className="font-bold text-sm">
                {t('cycle.insights.locked', 'Insights Locked')}
              </h4>
              <p className="text-xs text-muted-foreground max-w-xs">
                {t(
                  'cycle.insights.lockedDesc',
                  'Log at least 2 completed cycles to unlock regularity charts, BBT curves, and symptom matrix details.'
                )}
              </p>
            </div>
            <div className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {t('cycle.insights.progress', 'Progress: {{count}}/2 cycles', {
                count: completedCyclesCount,
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 2. Regularity Chart */}
          <Card>
            <CardHeader className="py-3.5 px-4">
              <CardTitle className="text-sm font-bold">
                {t('cycle.insights.regularity', 'Cycle Regularity')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t(
                  'cycle.insights.regularityDesc',
                  'Duration of last cycles vs. average.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-60 pt-0 px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cycles
                    .filter((c) => c.cycle_length)
                    .slice(-12)
                    .reverse()}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="start_date"
                    tickFormatter={(str) =>
                      new Date(str).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        timeZone: 'UTC',
                      })
                    }
                    tick={{ fontSize: 9 }}
                  />
                  <YAxis tick={{ fontSize: 9 }} domain={[15, 'auto']} />
                  <Tooltip
                    contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                    labelFormatter={(label) =>
                      `Cycle starting ${new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}`
                    }
                  />
                  <ReferenceLine
                    y={stats.avgCycleLength ?? 28}
                    stroke="#C9524E"
                    strokeDasharray="4 4"
                    label={{
                      value: `Avg: ${stats.avgCycleLength}d`,
                      fill: '#C9524E',
                      fontSize: 10,
                      position: 'top',
                    }}
                  />
                  <Bar
                    dataKey="cycle_length"
                    fill="#A9D3B5"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 3. BBT Curve */}
          <Card>
            <CardHeader className="py-3.5 px-4">
              <CardTitle className="text-sm font-bold">
                {t('cycle.insights.bbt', 'Basal Body Temperature (BBT)')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t(
                  'cycle.insights.bbtDesc',
                  'Logged temperatures indicating biphasic cycle.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-60 pt-0 px-2 pb-4">
              {bbtSeries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground italic">
                  {t(
                    'cycle.insights.noBbt',
                    'Log daily temperature logs to view your BBT chart.'
                  )}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={bbtSeries}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(str) => str.slice(5)}
                      tick={{ fontSize: 9 }}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      domain={['dataMin - 0.2', 'dataMax + 0.2']}
                      tickFormatter={(val) => Number(val).toFixed(2)}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                      formatter={(
                        val:
                          | string
                          | number
                          | readonly (string | number)[]
                          | undefined
                      ) => [
                        Number(val ?? 0).toFixed(2) + '°C',
                        t('cycle.insights.bbt', 'BBT'),
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="bbt"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* 4. Product Forecast */}
          <Card>
            <CardHeader className="py-3.5 px-4">
              <CardTitle className="text-sm font-bold">
                {t('cycle.insights.supply', 'Product Usage & Supply Forecast')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t(
                  'cycle.insights.supplyDesc',
                  'Averages and estimations for your next period.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/40 p-3 rounded-xl border">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">
                    {t('cycle.insights.avgVolume', 'Avg Flow Volume')}
                  </span>
                  <span className="text-lg font-bold text-primary flex items-center gap-1">
                    <Droplets className="h-4.5 w-4.5 text-red-500 fill-red-500" />
                    {productStats.avgVolumeMl} ml
                  </span>
                  <span className="block text-[9px] text-muted-foreground mt-0.5">
                    {productStats.avgProductsPerPeriod}{' '}
                    {t('cycle.insights.productsPerPeriod', 'products average')}
                  </span>
                </div>

                <div className="bg-muted/40 p-3 rounded-xl border">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">
                    {t('cycle.insights.yearlySpend', 'Yearly Spend (Est.)')}
                  </span>
                  <span className="text-lg font-bold text-primary flex items-center gap-1">
                    <TrendingUp className="h-4.5 w-4.5 text-green-500" />$
                    {productStats.costWasteYearlySpend}
                  </span>
                  <span className="block text-[9px] text-muted-foreground mt-0.5">
                    {t(
                      'cycle.insights.spendDesc',
                      'Pads: {{pads}} · Tampons: {{tampons}}',
                      {
                        pads: productStats.costWastePadsCount,
                        tampons: productStats.costWasteTamponsCount,
                      }
                    )}
                  </span>
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <h4 className="text-xs font-bold text-foreground">
                  {t(
                    'cycle.insights.nextForecast',
                    'Next Period Supply Forecast'
                  )}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(productStats.nextPeriodNeeded).map(
                    ([prod, count]) => (
                      <div
                        key={prod}
                        className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg px-2.5 py-1 text-xs flex items-center gap-2"
                      >
                        <span className="capitalize font-semibold">
                          {prod}:
                        </span>
                        <span className="font-bold text-primary">
                          {count} {t('cycle.insights.needed', 'needed')}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 5. Symptom Heatmap */}
          <Card>
            <CardHeader className="py-3.5 px-4">
              <CardTitle className="text-sm font-bold">
                {t('cycle.insights.symptoms', 'Symptom Frequencies by Phase')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t(
                  'cycle.insights.symptomsDesc',
                  'Occurrence counts aggregated across your tracked cycles.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 select-none">
              {Object.keys(matrix).length === 0 ? (
                <div className="flex h-36 items-center justify-center text-xs text-muted-foreground italic">
                  {t(
                    'cycle.insights.noSymptoms',
                    'Log symptoms in your daily log to view phase correlations.'
                  )}
                </div>
              ) : (
                <div className="space-y-3.5 max-h-52 overflow-y-auto pr-1">
                  {Object.entries(matrix).map(([symptom, phases]) => {
                    const total = Object.values(phases).reduce(
                      (acc: number, p) => acc + p.count,
                      0
                    ) as number;
                    return (
                      <div key={symptom} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="capitalize">{symptom}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {total} total
                          </span>
                        </div>
                        <div className="flex h-3 w-full rounded bg-muted overflow-hidden gap-0.5">
                          {Object.entries(phases).map(([phase, data]) => {
                            const val = data.count;
                            if (val === 0) return null;
                            const pct = (val / total) * 100;
                            const bg =
                              phase === 'menstrual'
                                ? 'bg-red-500'
                                : phase === 'fertile'
                                  ? 'bg-green-500'
                                  : phase === 'ovulation'
                                    ? 'bg-green-700'
                                    : phase === 'luteal'
                                      ? 'bg-amber-500'
                                      : 'bg-muted-foreground';
                            return (
                              <div
                                key={phase}
                                className={bg}
                                style={{ width: `${pct}%` }}
                                title={`${phase}: ${val} logs`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-2 text-[9px] text-muted-foreground justify-center pt-2 select-none border-t">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-500" />{' '}
                      Menstrual
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-green-500" />{' '}
                      Fertile
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-green-700" />{' '}
                      Ovulation
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />{' '}
                      Luteal
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 6. Hormone Curve */}
          <Card className="col-span-1 md:col-span-2">
            <CardHeader className="py-3.5 px-4">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>
                  {t(
                    'cycle.insights.hormones',
                    'Hormone Fluctuations Simulation'
                  )}
                </span>
                {settings?.birth_control_method !== 'none' && (
                  <span className="text-[10px] font-normal bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-950/30 px-2 py-0.5 rounded flex items-center gap-1">
                    <Info className="h-3 w-3" />{' '}
                    {t(
                      'cycle.insights.bcSuppressed',
                      'Flat Hormone Curve (Birth Control active)'
                    )}
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {t(
                  'cycle.insights.hormonesDesc',
                  'Typical curves for a standard 28-day cycle.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64 pt-0 px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={
                    settings?.birth_control_method !== 'none'
                      ? HORMONE_CURVES.map((c) => ({
                          ...c,
                          estrogen: 15,
                          progesterone: 10,
                          lh: 8,
                          fsh: 8,
                        }))
                      : [...HORMONE_CURVES]
                  }
                  margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    label={{
                      value: 'Cycle Day',
                      position: 'insideBottom',
                      offset: -5,
                      fontSize: 10,
                    }}
                    tick={{ fontSize: 9 }}
                  />
                  <YAxis tick={false} domain={[0, 110]} />
                  <Tooltip
                    contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                  <Line
                    type="monotone"
                    dataKey="estrogen"
                    stroke="#ec4899"
                    strokeWidth={1.5}
                    dot={false}
                    name={t('cycle.hormone.estrogen', 'Estrogen')}
                  />
                  <Line
                    type="monotone"
                    dataKey="progesterone"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    dot={false}
                    name={t('cycle.hormone.progesterone', 'Progesterone')}
                  />
                  <Line
                    type="monotone"
                    dataKey="lh"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    dot={false}
                    name={t('cycle.hormone.lh', 'LH')}
                  />
                  <Line
                    type="monotone"
                    dataKey="fsh"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    dot={false}
                    name={t('cycle.hormone.fsh', 'FSH')}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <CorrelationCards />
    </div>
  );
}
