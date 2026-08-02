import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Syringe } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSerumCurve } from '@/hooks/useMedications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { Medication } from '@/types/medications';
import FastingTimer from './FastingTimer';
import Glp1LogInjection from './Glp1LogInjection';
import Glp1InventoryManager from './Glp1InventoryManager';
import Glp1TitrationManager from './Glp1TitrationManager';
import Glp1RecentInjections from './Glp1RecentInjections';

interface Glp1CoachProps {
  med: Medication;
}

type PkAxisMode = 'date' | 'day';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Glp1Coach({ med }: Glp1CoachProps) {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const [axisMode, setAxisMode] = useState<PkAxisMode>('date');
  const medId = med.id;
  const glp1Drug = (
    med.custom_fields as { glp1_drug?: string } | null | undefined
  )?.glp1_drug;
  const isOralGlp1 =
    glp1Drug === 'oral_semaglutide' ||
    (glp1Drug === 'custom' &&
      (med.custom_fields as { custom_is_oral?: boolean } | null | undefined)
        ?.custom_is_oral === true);
  // Injection-specific UI (body map, pens, shot log) only applies to injectable meds.
  // Oral/liquid GLP-1 (e.g. Rybelsus) still gets the PK curve, titration & fasting timer.
  const isInjectable = med.type_id === 'injection';

  const curveQ = useSerumCurve(medId);

  const anchorDate = curveQ.data?.anchorDate ?? null;
  // Day 0 is the earliest injection. Without that anchor the curve can only be
  // expressed as offsets, so the date axis is unavailable rather than guessed at.
  const anchorMs = useMemo(() => {
    if (!anchorDate) return null;
    const ms = new Date(anchorDate).getTime();
    return Number.isNaN(ms) ? null : ms;
  }, [anchorDate]);
  const canShowDates = anchorMs !== null;
  const effectiveAxisMode: PkAxisMode = canShowDates ? axisMode : 'day';

  const chartData = useMemo(() => {
    return (curveQ.data?.curve ?? []).map((p) => {
      const day = Number(p.day.toFixed(1));
      return {
        day,
        ts: anchorMs === null ? null : anchorMs + day * DAY_MS,
        pct: Math.round(p.fraction * 100),
      };
    });
  }, [curveQ.data?.curve, anchorMs]);

  const formatAxisDate = (ms: number) =>
    formatDateInUserTimezone(new Date(ms), 'MMM dd');

  return (
    <div className="space-y-4">
      {/* Oral GLP-1 fasting timer (oral semaglutide only) */}
      {isOralGlp1 && <FastingTimer medId={medId} />}

      {/* Log injection + site rotation (injectable meds only) */}
      {isInjectable && <Glp1LogInjection med={med} />}

      {/* PK serum curve */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base font-semibold">
            <span>
              {t('medications.glp1.pkTitle', 'PK serum level')} —{' '}
              {curveQ.data?.drugName ?? curveQ.data?.drugId ?? med.name}
            </span>
            <span className="flex items-center gap-2">
              {/* Only offer the switch when there is an anchor date to switch to. */}
              {canShowDates && chartData.length > 0 && (
                <span className="flex items-center gap-1">
                  <Button
                    variant={axisMode === 'date' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setAxisMode('date')}
                    aria-pressed={axisMode === 'date'}
                    className={`rounded-full px-3 h-7 transition-all ${
                      axisMode === 'date'
                        ? 'bg-slate-200/60 dark:bg-muted shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-xs font-semibold">
                      {t('medications.glp1.pkAxisDates', 'Dates')}
                    </span>
                  </Button>
                  <Button
                    variant={axisMode === 'day' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setAxisMode('day')}
                    aria-pressed={axisMode === 'day'}
                    className={`rounded-full px-3 h-7 transition-all ${
                      axisMode === 'day'
                        ? 'bg-slate-200/60 dark:bg-muted shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-xs font-semibold">
                      {t('medications.glp1.pkAxisDays', 'Days')}
                    </span>
                  </Button>
                </span>
              )}
              {curveQ.data?.currentLevelFraction != null && (
                <Badge variant="secondary">
                  ~{Math.round(curveQ.data.currentLevelFraction * 100)}% now
                </Badge>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                'medications.glp1.pkEmpty',
                'Log injections to model your serum level. (Needs a recognized GLP-1 drug — set it on the medication.)'
              )}
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="pk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey={effectiveAxisMode === 'date' ? 'ts' : 'day'}
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(value) =>
                      effectiveAxisMode === 'date'
                        ? formatAxisDate(value)
                        : `D${Math.round(value)}`
                    }
                    fontSize={11}
                  />
                  <YAxis domain={[0, 100]} unit="%" fontSize={11} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, 'Level']}
                    labelFormatter={(label) => {
                      // Recharts types this as ReactNode; the axis is numeric, so
                      // coerce and fall back to the raw label if it ever isn't.
                      const value = Number(label);
                      if (Number.isNaN(value)) return label;
                      return effectiveAxisMode === 'date'
                        ? formatDateInUserTimezone(new Date(value), 'PP')
                        : t('medications.glp1.pkDayLabel', 'Day {{day}}', {
                            day: Math.round(value),
                          });
                    }}
                  />
                  {/* Injection markers (each logged shot). The x value must be in the
                      same units as the axis, or every marker lands in the wrong place. */}
                  {(curveQ.data?.doseDays ?? []).map((d, i) => (
                    <ReferenceLine
                      key={`dose-${i}`}
                      x={
                        effectiveAxisMode === 'date' && anchorMs !== null
                          ? anchorMs + d * DAY_MS
                          : d
                      }
                      stroke="#9ca3af"
                      strokeDasharray="2 2"
                      label={
                        i === 0
                          ? (props: {
                              viewBox?: { x?: number; y?: number };
                            }) => (
                              <Syringe
                                x={(props.viewBox?.x ?? 0) - 6}
                                y={(props.viewBox?.y ?? 0) + 2}
                                width={12}
                                height={12}
                                stroke="#3b82f6"
                              />
                            )
                          : undefined
                      }
                    />
                  ))}
                  <Area
                    type="monotone"
                    dataKey="pct"
                    stroke="#3b82f6"
                    fill="url(#pk)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="mt-1 text-xs text-muted-foreground">
                {curveQ.data?.disclaimer}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pen / vial inventory (injectable meds only) */}
      {isInjectable && <Glp1InventoryManager med={med} />}

      {/* Titration plan */}
      <Glp1TitrationManager med={med} />

      {/* Recent injections (injectable meds only) */}
      {isInjectable && <Glp1RecentInjections med={med} />}
    </div>
  );
}
