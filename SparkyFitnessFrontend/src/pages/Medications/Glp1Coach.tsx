import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Syringe, AlertTriangle } from 'lucide-react';
import { INJECTION_SITES } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [deductPen, setDeductPen] = useState(true);
  const site = selectedSite ?? suggestedSite;
  const inUsePen = pensQ.data?.find(
    (p) => p.status === 'in_use' || p.status === 'sealed'
  );

  const logMutation = useLogInjectionMutation(medId);
  const addPenMutation = useCreatePenMutation(medId);

  const handleLog = () =>
    logMutation.mutate(
      {
        medication_id: medId,
        site,
        dose_mg: med.dose_amount,
        pen_id: deductPen ? (inUsePen?.id ?? null) : null,
        deduct_pen: deductPen && Boolean(inUsePen),
      },
      { onSuccess: () => setSelectedSite(null) }
    );

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
      {/* Log injection + site rotation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Syringe className="h-4 w-4 text-blue-500" /> Log injection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">
              Injection site (8-zone rotation · green = suggested, amber =
              resting &lt;
              {sitesQ.data?.restDays ?? 7}d)
            </Label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {INJECTION_SITES.map((s) => {
                const isSuggested = s.id === suggestedSite;
                const isResting = restingSites.has(s.id);
                const isSelected = s.id === site;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSite(s.id)}
                    className={[
                      'rounded-md border p-2 text-xs transition',
                      isSelected ? 'ring-2 ring-primary' : '',
                      isSuggested
                        ? 'border-green-500 bg-green-50 dark:bg-green-950'
                        : isResting
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950'
                          : 'border-border',
                    ].join(' ')}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            {site && restingSites.has(site) && (
              <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" /> This site was used
                recently — rotate to avoid lipohypertrophy.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">
                Auto-deduct a dose from inventory
              </Label>
              <p className="text-xs text-muted-foreground">
                {inUsePen
                  ? `Uses pen/vial (${(inUsePen.doses_total ?? 0) - inUsePen.doses_used} doses left)`
                  : 'No pen/vial in inventory'}
              </p>
            </div>
            <Switch
              checked={deductPen && Boolean(inUsePen)}
              onCheckedChange={setDeductPen}
              disabled={!inUsePen}
            />
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
                    tickFormatter={(d) => `D${d}`}
                    fontSize={11}
                  />
                  <YAxis domain={[0, 100]} unit="%" fontSize={11} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Level']} />
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

      {/* Pen / vial inventory */}
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
          {(pensQ.data ?? []).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
              <div>
                <span className="font-medium capitalize">{p.kind}</span>{' '}
                {p.dose_mg ? `${p.dose_mg} mg` : ''}{' '}
                {p.concentration_mg_ml
                  ? `· ${p.concentration_mg_ml} mg/mL`
                  : ''}
                {p.expiry_date && (
                  <span className="text-muted-foreground">
                    {' '}
                    · exp {p.expiry_date}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {p.reorder_flag && <Badge variant="destructive">Reorder</Badge>}
                <span className="text-muted-foreground">
                  {(p.doses_total ?? 0) - p.doses_used}/{p.doses_total ?? '?'}{' '}
                  doses
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Titration plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dose titration plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(titrationQ.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No titration steps yet.
            </p>
          )}
          {(titrationQ.data ?? []).map((step) => (
            <div
              key={step.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
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
                {step.is_taper && (
                  <Badge variant="outline" className="ml-2">
                    taper
                  </Badge>
                )}
              </div>
              <Badge
                variant={step.status === 'active' ? 'default' : 'secondary'}
              >
                {step.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recent injections */}
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
    </div>
  );
}
