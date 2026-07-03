import { useMemo } from 'react';
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
import type { Medication } from '@/types/medications';
import FastingTimer from './FastingTimer';
import Glp1LogInjection from './Glp1LogInjection';
import Glp1InventoryManager from './Glp1InventoryManager';
import Glp1TitrationManager from './Glp1TitrationManager';
import Glp1RecentInjections from './Glp1RecentInjections';

interface Glp1CoachProps {
  med: Medication;
}

export default function Glp1Coach({ med }: Glp1CoachProps) {
  const { t } = useTranslation();
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

  const chartData = useMemo(() => {
    return (curveQ.data?.curve ?? []).map((p) => ({
      day: Number(p.day.toFixed(1)),
      pct: Math.round(p.fraction * 100),
    }));
  }, [curveQ.data?.curve]);

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
            {curveQ.data?.currentLevelFraction != null && (
              <Badge variant="secondary">
                ~{Math.round(curveQ.data.currentLevelFraction * 100)}% now
              </Badge>
            )}
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
                    dataKey="day"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(d) => `D${Math.round(d)}`}
                    fontSize={11}
                  />
                  <YAxis domain={[0, 100]} unit="%" fontSize={11} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Level']} />
                  {/* Injection markers (each logged shot) */}
                  {(curveQ.data?.doseDays ?? []).map((d, i) => (
                    <ReferenceLine
                      key={`dose-${i}`}
                      x={d}
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
