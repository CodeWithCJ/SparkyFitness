import { useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  HR_ZONE_COUNT,
  HR_ZONE_METHODS,
  MAX_MAX_HR,
  MAX_RESTING_HR,
  MIN_MAX_HR,
  MIN_RESTING_HR,
  customFloorsProblem,
  heartRateDisplayBands,
  type HeartRateZonesResponse,
  type HrZoneDisplayCount,
  type HrZoneMethod,
} from '@workspace/shared';
import { AccordionContent, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useHeartRateZones,
  useUpdateHeartRateZonesMutation,
} from '@/hooks/Settings/useHeartRateZones';
import {
  displayBandLabel,
  maxHrSourceLabel,
  zoneMethodName,
} from '@/utils/heartRateZoneLabels';

interface Draft {
  maxHr: string;
  restingHr: string;
  method: HrZoneMethod;
  floors: string[];
  displayZones: HrZoneDisplayCount;
}

const draftFrom = (data: HeartRateZonesResponse): Draft => ({
  maxHr: data.settings.max_heart_rate?.toString() ?? '',
  restingHr: data.settings.resting_heart_rate?.toString() ?? '',
  method: data.settings.method,
  displayZones: data.settings.display_zones,
  // Custom zones start from the zones in use, so switching to Custom edits
  // what the person already sees.
  floors:
    data.settings.custom_floors?.map(String) ??
    data.resolved.zones.map((zone) => String(zone.lower_bpm)),
});

const parseWhole = (text: string): number | null =>
  text.trim() === '' ? null : Number(text);

export const HeartRateZoneSettings = () => {
  const { t } = useTranslation();
  const { data } = useHeartRateZones();
  const update = useUpdateHeartRateZonesMutation();
  // What the person has typed; null until they change something, so the form
  // shows the saved settings (including once they arrive or are saved).
  const [edits, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = edits ?? (data ? draftFrom(data) : null);

  const dirty =
    !!data &&
    !!edits &&
    JSON.stringify(edits) !== JSON.stringify(draftFrom(data));

  const save = () => {
    if (!draft) return;
    const maxHeartRate = parseWhole(draft.maxHr);
    const restingHeartRate = parseWhole(draft.restingHr);
    const customFloors = draft.floors.map((floor) => Number(floor));
    if (
      maxHeartRate !== null &&
      (!Number.isInteger(maxHeartRate) ||
        maxHeartRate < MIN_MAX_HR ||
        maxHeartRate > MAX_MAX_HR)
    ) {
      setError(
        t('settings.heartRateZones.errors.maxRange', {
          defaultValue:
            'Max heart rate must be a whole number from {{min}} to {{max}} bpm.',
          min: MIN_MAX_HR,
          max: MAX_MAX_HR,
        })
      );
      return;
    }
    if (
      restingHeartRate !== null &&
      (!Number.isInteger(restingHeartRate) ||
        restingHeartRate < MIN_RESTING_HR ||
        restingHeartRate > MAX_RESTING_HR)
    ) {
      setError(
        t('settings.heartRateZones.errors.restingRange', {
          defaultValue:
            'Resting heart rate must be a whole number from {{min}} to {{max}} bpm.',
          min: MIN_RESTING_HR,
          max: MAX_RESTING_HR,
        })
      );
      return;
    }
    if (draft.method === 'heart_rate_reserve' && restingHeartRate === null) {
      setError(
        t(
          'settings.heartRateZones.errors.needsResting',
          'Heart rate reserve zones need a resting heart rate.'
        )
      );
      return;
    }
    if (draft.method === 'custom' && customFloorsProblem(customFloors)) {
      setError(
        t(
          'settings.heartRateZones.errors.customFloors',
          'Each zone must start above the one before it, from 30 to 250 bpm.'
        )
      );
      return;
    }
    setError(null);
    update.mutate(
      {
        max_heart_rate: maxHeartRate,
        resting_heart_rate: restingHeartRate,
        method: draft.method,
        display_zones: draft.displayZones,
        ...(draft.method === 'custom' ? { custom_floors: customFloors } : {}),
      },
      { onSuccess: () => setDraft(null) }
    );
  };

  const reset = () => {
    setError(null);
    update.mutate({ reset: true }, { onSuccess: () => setDraft(null) });
  };

  const resolved = data?.resolved;

  return (
    <>
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.heartRateZones.description',
          'Max and resting heart rate, and how your five zones are worked out'
        )}
      >
        <HeartPulse className="h-5 w-5" />
        {t('settings.heartRateZones.title', 'Heart Rate Zones')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        {!resolved || !draft ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'settings.heartRateZones.loading',
              'Loading your heart rate zones…'
            )}
          </p>
        ) : (
          <>
            <div data-testid="hr-zone-summary" className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t('settings.heartRateZones.maxHrSummary', {
                  defaultValue: 'Max heart rate {{max}} bpm. {{source}}.',
                  max: resolved.max_hr,
                  source: maxHrSourceLabel(t, resolved.max_hr_source),
                })}
              </p>
              <ul className="divide-y rounded-md border">
                {heartRateDisplayBands(
                  resolved.zones.map((zone) => ({
                    zone: zone.zone,
                    lowerBpm: zone.lower_bpm,
                    upperBpm: zone.upper_bpm,
                  })),
                  draft.displayZones
                ).map((band) => (
                  <li
                    key={band.index}
                    data-testid={`hr-zone-${band.index}`}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: band.color }}
                      />
                      {displayBandLabel(t, band)}
                    </span>
                    <span className="text-muted-foreground">
                      {band.upperBpm === null
                        ? t('settings.heartRateZones.zoneRangeOpen', {
                            defaultValue: '{{lower}}+ bpm',
                            lower: band.lowerBpm,
                          })
                        : t('settings.heartRateZones.zoneRange', {
                            defaultValue: '{{lower}}–{{upper}} bpm',
                            lower: band.lowerBpm,
                            upper: band.upperBpm,
                          })}
                    </span>
                  </li>
                ))}
              </ul>
              {resolved.method !== resolved.effective_method && (
                <p
                  data-testid="hr-zone-fallback"
                  className="text-xs text-muted-foreground"
                >
                  {t(
                    'settings.heartRateZones.fellBack',
                    'Your chosen method needs more information, so zones are shown as % of max heart rate.'
                  )}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="hr_zone_method">
                  {t(
                    'settings.heartRateZones.method.title',
                    'How zones are worked out'
                  )}
                </Label>
                <Select
                  value={draft.method}
                  onValueChange={(method) =>
                    setDraft({ ...draft, method: method as HrZoneMethod })
                  }
                >
                  <SelectTrigger id="hr_zone_method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_ZONE_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {zoneMethodName(t, method)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="hr_zone_max">
                  {t('settings.heartRateZones.maxHr', 'Max heart rate (bpm)')}
                </Label>
                <Input
                  id="hr_zone_max"
                  type="number"
                  inputMode="numeric"
                  value={draft.maxHr}
                  placeholder={String(resolved.max_hr)}
                  onChange={(e) =>
                    setDraft({ ...draft, maxHr: e.target.value })
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    'settings.heartRateZones.maxHrHint',
                    'Leave empty to work it out from your date of birth.'
                  )}
                </p>
              </div>
              <div>
                <Label htmlFor="hr_zone_resting">
                  {t(
                    'settings.heartRateZones.restingHr',
                    'Resting heart rate (bpm)'
                  )}
                </Label>
                <Input
                  id="hr_zone_resting"
                  type="number"
                  inputMode="numeric"
                  value={draft.restingHr}
                  onChange={(e) =>
                    setDraft({ ...draft, restingHr: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="max-w-xs">
              <Label htmlFor="hr_zone_display">
                {t('settings.heartRateZones.display.title', 'Show')}
              </Label>
              <Select
                value={String(draft.displayZones)}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    displayZones: value === '4' ? 4 : 5,
                  })
                }
              >
                <SelectTrigger id="hr_zone_display">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">
                    {t('settings.heartRateZones.display.five', '5 zones')}
                  </SelectItem>
                  <SelectItem value="4">
                    {t('settings.heartRateZones.display.four', '4 tiers')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'settings.heartRateZones.display.hint',
                  'Four tiers are Light (zones 1 and 2), Moderate (zone 3), Vigorous (zone 4) and Peak (zone 5). Only what you see changes: zones are still worked out and stored as five.'
                )}
              </p>
            </div>

            {draft.method === 'custom' && (
              <div>
                <Label>
                  {t(
                    'settings.heartRateZones.customFloors',
                    'Where each zone starts (bpm)'
                  )}
                </Label>
                <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-5">
                  {Array.from({ length: HR_ZONE_COUNT }, (_, index) => (
                    <div key={index}>
                      <Label
                        htmlFor={`hr_zone_floor_${index + 1}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t('settings.heartRateZones.zone', {
                          defaultValue: 'Zone {{zone}}',
                          zone: index + 1,
                        })}
                      </Label>
                      <Input
                        id={`hr_zone_floor_${index + 1}`}
                        type="number"
                        inputMode="numeric"
                        value={draft.floors[index] ?? ''}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            floors: draft.floors.map((floor, i) =>
                              i === index ? e.target.value : floor
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {draft.method === 'heart_rate_reserve'
                ? t(
                    'settings.heartRateZones.method.heartRateReserveHint',
                    'Zones are 50, 60, 70, 80 and 90% of the gap between your resting and max heart rate (Karvonen). Needs a resting heart rate.'
                  )
                : draft.method === 'custom'
                  ? t(
                      'settings.heartRateZones.method.customHint',
                      'Set the bpm where each zone starts. Time below zone 1 is not counted.'
                    )
                  : t(
                      'settings.heartRateZones.method.percentMaxHint',
                      'Zones start at 50, 60, 70, 80 and 90% of your max heart rate.'
                    )}
            </p>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              {t(
                'settings.heartRateZones.historyNote',
                'Changes apply to workouts you record or sync from now on. Time in zone already stored for past workouts is not recalculated.'
              )}
            </p>

            <div className="flex gap-2">
              <Button onClick={save} disabled={!dirty || update.isPending}>
                {t('settings.heartRateZones.save', 'Save')}
              </Button>
              <Button
                variant="outline"
                onClick={reset}
                disabled={update.isPending}
              >
                {t('settings.heartRateZones.reset', 'Reset to default')}
              </Button>
            </div>
          </>
        )}
      </AccordionContent>
    </>
  );
};
