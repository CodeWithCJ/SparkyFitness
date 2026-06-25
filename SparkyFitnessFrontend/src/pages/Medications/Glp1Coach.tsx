import { useMemo, useState } from 'react';
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
import { Syringe, AlertTriangle } from 'lucide-react';
import { INJECTION_SITES } from '@workspace/shared';
import InjectionSiteBodyMap from './InjectionSiteBodyMap';
import InjectionSiteSettings from './InjectionSiteSettings';
import FastingTimer from './FastingTimer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useSerumCurve,
  useSiteSuggestion,
  useMedicationPens,
  useMedicationInjections,
  useMedicationTitration,
  useLogInjectionMutation,
  useCreatePenMutation,
} from '@/hooks/useMedications';
import type { Medication } from '@/types/medications';

export default function Glp1Coach({ med }: { med: Medication }) {
  const medId = med.id;
  const glp1Drug = (
    med.custom_fields as Record<string, unknown> | null | undefined
  )?.glp1_drug;
  const isOralGlp1 = glp1Drug === 'oral_semaglutide';
  // Injection-specific UI (body map, pens, shot log) only applies to injectable meds.
  // Oral/liquid GLP-1 (e.g. Rybelsus) still gets the PK curve, titration & fasting timer.
  const isInjectable = med.type_id === 'injection';

  const sitesQ = useSiteSuggestion(medId);
  const curveQ = useSerumCurve(medId);
  const pensQ = useMedicationPens(medId);
  const injQ = useMedicationInjections(medId);
  const titrationQ = useMedicationTitration(medId);

  const suggestedSite = sitesQ.data?.suggestedSiteId ?? null;
  const restingSites = useMemo(
    () => new Set(sitesQ.data?.restingSiteIds ?? []),
    [sitesQ.data]
  );
  // Honor the user's customized active site set (Settings → Customize sites).
  const mapSites = useMemo(() => {
    const active = sitesQ.data?.activeSiteIds;
    if (!active || active.length === 0) return undefined;
    const order = new Map(active.map((id, i) => [id, i] as const));
    return INJECTION_SITES.filter((s) => order.has(s.id)).sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    );
  }, [sitesQ.data]);

  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const site = selectedSite ?? suggestedSite;
  const inUsePen = pensQ.data?.find(
    (p) => p.status === 'in_use' || p.status === 'sealed'
  );

  // Dose, date/time, and pen are user-editable at log time (mid-titration the dose changes,
  // and shots are sometimes logged after the fact).
  const [doseMg, setDoseMg] = useState(
    med.dose_amount != null ? String(med.dose_amount) : ''
  );
  const [injectedAt, setInjectedAt] = useState('');
  // null = "auto" (fall back to the in-use pen); 'none' = don't deduct; otherwise a pen id.
  const [penChoice, setPenChoice] = useState<string | null>(null);
  const effectivePenId = penChoice ?? inUsePen?.id ?? 'none';

  const logMutation = useLogInjectionMutation(medId);
  const addPenMutation = useCreatePenMutation(medId);

  const handleLog = () => {
    const willDeduct = effectivePenId !== 'none';
    logMutation.mutate(
      {
        medication_id: medId,
        site,
        dose_mg: doseMg ? Number(doseMg) : (med.dose_amount ?? null),
        injected_at: injectedAt
          ? new Date(injectedAt).toISOString()
          : undefined,
        pen_id: willDeduct ? effectivePenId : null,
        deduct_pen: willDeduct,
      },
      {
        onSuccess: () => {
          setSelectedSite(null);
          setInjectedAt('');
        },
      }
    );
  };

  const handleAddPen = () =>
    addPenMutation.mutate({
      kind: 'pen',
      dose_mg: med.dose_amount,
      doses_total: 4,
      status: 'sealed',
    });

  const chartData = (curveQ.data?.curve ?? []).map((p) => ({
    day: Number(p.day.toFixed(1)),
    pct: Math.round(p.fraction * 100),
  }));

  return (
    <div className="space-y-4">
      {/* Oral GLP-1 fasting timer (oral semaglutide only) */}
      {isOralGlp1 && <FastingTimer medId={medId} />}

      {/* Log injection + site rotation (injectable meds only) */}
      {isInjectable && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Syringe className="h-4 w-4 text-blue-500" /> Log injection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">
                  Injection site ·{' '}
                  <span className="text-green-600">green = suggested</span>,{' '}
                  <span className="text-amber-600">
                    amber = resting &lt;{sitesQ.data?.restDays ?? 7}d
                  </span>
                </Label>
                <InjectionSiteSettings />
              </div>
              <div className="mt-2 flex flex-col items-center gap-2">
                <InjectionSiteBodyMap
                  sites={mapSites}
                  selectedSiteId={site}
                  suggestedSiteId={suggestedSite}
                  restingSiteIds={sitesQ.data?.restingSiteIds ?? []}
                  onSelect={setSelectedSite}
                />
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Selected:</span>
                  <span className="font-medium">
                    {site
                      ? (INJECTION_SITES.find((s) => s.id === site)?.label ??
                        site)
                      : 'Tap a zone'}
                  </span>
                </div>
              </div>
              {site && restingSites.has(site) && (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> This site was used
                  recently — rotate to avoid lipohypertrophy.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Dose (mg)
                </Label>
                <Input
                  type="number"
                  step="0.05"
                  value={doseMg}
                  onChange={(e) => setDoseMg(e.target.value)}
                  placeholder={
                    med.dose_amount != null ? String(med.dose_amount) : '0'
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Date &amp; time
                </Label>
                <Input
                  type="datetime-local"
                  value={injectedAt}
                  onChange={(e) => setInjectedAt(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Deduct from pen/vial
              </Label>
              <Select
                value={effectivePenId}
                onValueChange={(v) => setPenChoice(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Don't deduct" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Don&apos;t deduct</SelectItem>
                  {(pensQ.data ?? [])
                    .filter((p) => p.status !== 'finished')
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.kind}
                        {p.dose_mg ? ` ${p.dose_mg}mg` : ''} ·{' '}
                        {(p.doses_total ?? 0) - p.doses_used} left
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleLog}
              disabled={!site || logMutation.isPending}
              className="w-full"
            >
              {logMutation.isPending
                ? 'Logging…'
                : `Log injection${site ? ` — ${INJECTION_SITES.find((s) => s.id === site)?.label}` : ''}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* PK serum curve */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>PK serum level — {curveQ.data?.drugId ?? med.name}</span>
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
              Log injections to model your serum level. (Needs a recognized
              GLP-1 drug — set it on the medication.)
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
                          ? { value: '💉', position: 'insideTop', fontSize: 10 }
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
      {isInjectable && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Pen / vial inventory</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddPen}
                disabled={addPenMutation.isPending}
              >
                Add pen
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(pensQ.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                No pens/vials tracked.
              </p>
            )}
            {(pensQ.data ?? []).map((p) => {
              const total = p.doses_total ?? 0;
              const left = Math.max(0, total - p.doses_used);
              const pct = total > 0 ? Math.round((left / total) * 100) : 0;
              const low = total > 0 && pct <= 25;
              return (
                <div key={p.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{p.kind}</span>
                      {p.dose_mg ? (
                        <span className="text-muted-foreground">
                          {p.dose_mg} mg
                        </span>
                      ) : null}
                      {p.concentration_mg_ml ? (
                        <span className="text-muted-foreground">
                          · {p.concentration_mg_ml} mg/mL
                        </span>
                      ) : null}
                      {p.status === 'in_use' && (
                        <Badge variant="secondary" className="text-[10px]">
                          in use
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.reorder_flag && (
                        <Badge variant="destructive">Reorder</Badge>
                      )}
                      <span className="font-medium tabular-nums">
                        {left}/{total || '?'}{' '}
                        <span className="font-normal text-muted-foreground">
                          doses
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${low ? 'bg-amber-500' : 'bg-blue-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {(p.expiry_date || p.bud_date) && (
                    <div className="mt-1.5 flex gap-3 text-xs text-muted-foreground">
                      {p.expiry_date && <span>Exp {p.expiry_date}</span>}
                      {p.bud_date && <span>BUD {p.bud_date}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Titration plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dose titration plan</CardTitle>
        </CardHeader>
        <CardContent>
          {(titrationQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No titration steps yet.
            </p>
          ) : (
            <ol className="relative space-y-4 border-l border-muted pl-6">
              {(titrationQ.data ?? []).map((step) => {
                const active = step.status === 'active';
                const done = step.status === 'done';
                return (
                  <li key={step.id} className="relative">
                    <span
                      className={`absolute -left-[27px] mt-1 h-3.5 w-3.5 rounded-full border-2 ${
                        active
                          ? 'border-blue-500 bg-blue-500'
                          : done
                            ? 'border-green-500 bg-green-500'
                            : 'border-muted-foreground/40 bg-background'
                      }`}
                    />
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">
                          {step.dose_mg} {step.dose_unit}
                        </span>
                        {step.start_date && (
                          <span className="text-muted-foreground">
                            {' '}
                            · {step.start_date}
                          </span>
                        )}
                        {step.planned_weeks ? (
                          <span className="text-muted-foreground">
                            {' '}
                            · {step.planned_weeks} wks
                          </span>
                        ) : null}
                        {step.is_taper && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            taper
                          </Badge>
                        )}
                      </div>
                      <Badge
                        variant={active ? 'default' : 'secondary'}
                        className="capitalize"
                      >
                        {step.status}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Recent injections (injectable meds only) */}
      {isInjectable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent injections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(injQ.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                No injections logged yet.
              </p>
            )}
            {(injQ.data ?? []).slice(0, 8).map((inj) => (
              <div
                key={inj.id}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <span>
                  {INJECTION_SITES.find((s) => s.id === inj.site)?.label ??
                    inj.site ??
                    '—'}
                </span>
                <span className="text-muted-foreground">
                  {inj.dose_mg ? `${inj.dose_mg} mg · ` : ''}
                  {new Date(inj.injected_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
