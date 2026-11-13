import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LAB_MARKER_PRESETS,
  buildLabPickerOptions,
  dropStalePrefilledRange,
  labPresetDefaults,
  labPresetName,
  isDayString,
  todayInZone,
  type CreateLabResultBody,
  type LabMarker,
  type LabMarkerLabels,
  type LabResultResponse,
  type LabSex,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useSaveLabResult } from '@/hooks/Labs/useLabResults';
import { exactLabValue, exactRangeBound, labNumber } from './labFormat';

interface LabResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All markers, to pick from and to prefill a unit and range. */
  markers: LabMarker[];
  labels: LabMarkerLabels;
  sex: LabSex | null;
  /** The marker to add a result to, when it is already known. */
  marker?: LabMarker | null;
  /** A saved result to edit; its marker cannot change. */
  result?: LabResultResponse | null;
}

type Picked =
  | { kind: 'builtin'; key: string; name: string }
  | { kind: 'custom'; id: string; name: string }
  | { kind: 'new'; name: string };

const text = (value: number | null | undefined) =>
  value == null ? '' : labNumber(value);

const LabResultDialog = ({
  open,
  onOpenChange,
  markers,
  labels,
  sex,
  marker,
  result,
}: LabResultDialogProps) => {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const saveResult = useSaveLabResult();

  // The unit and range a new result starts from: the marker's latest result,
  // else the preset's (the profile's sex picks the range), else the marker's.
  const seedSource = (
    next: Picked
  ): { unit: string; low: number | null; high: number | null } => {
    const existing = markers.find((m) =>
      next.kind === 'builtin'
        ? m.markerKey === next.key
        : next.kind === 'custom' && m.markerId === next.id
    );
    const preset =
      next.kind === 'builtin'
        ? LAB_MARKER_PRESETS.find((p) => p.key === next.key)
        : undefined;
    const latest = existing?.latest ?? null;
    let source: { unit: string; low: number | null; high: number | null } = {
      unit: '',
      low: null,
      high: null,
    };
    if (latest) {
      source = {
        unit: latest.unit,
        low: latest.ref_range_low,
        high: latest.ref_range_high,
      };
    } else if (preset) {
      const defaults = labPresetDefaults(preset, sex);
      source = {
        unit: defaults.unit,
        low: defaults.ref_range_low,
        high: defaults.ref_range_high,
      };
    } else if (existing) {
      source = {
        unit: existing.unit,
        low: existing.ref_range_low,
        high: existing.ref_range_high,
      };
    }
    return source;
  };

  const initialPick = (): Picked | null => {
    if (result) {
      const found = markers.find(
        (m) =>
          (result.marker_key && m.markerKey === result.marker_key) ||
          (result.custom_marker_id && m.markerId === result.custom_marker_id)
      );
      return found
        ? found.markerKey
          ? { kind: 'builtin', key: found.markerKey, name: found.name }
          : { kind: 'custom', id: found.markerId as string, name: found.name }
        : null;
    }
    if (!marker) return null;
    return marker.markerKey
      ? { kind: 'builtin', key: marker.markerKey, name: marker.name }
      : { kind: 'custom', id: marker.markerId as string, name: marker.name };
  };

  // A new result for a marker the dialog opens on starts from the same unit and
  // range as one picked in it.
  const [initial] = useState(() => {
    const pick = initialPick();
    return { pick, seed: !result && pick ? seedSource(pick) : null };
  });
  const [picked, setPicked] = useState<Picked | null>(initial.pick);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(result?.entry_date ?? todayInZone(timezone));
  const [value, setValue] = useState(text(result?.value_numeric));
  const [unit, setUnit] = useState(result?.unit ?? initial.seed?.unit ?? '');
  const [low, setLow] = useState(
    text(result ? result.ref_range_low : initial.seed?.low)
  );
  const [high, setHigh] = useState(
    text(result ? result.ref_range_high : initial.seed?.high)
  );
  const [labName, setLabName] = useState(result?.lab_name ?? '');
  const [notes, setNotes] = useState(result?.notes ?? '');
  // What the unit and range were filled in with. Editing a saved result starts
  // from its own values, so changing only the unit drops a range that belonged
  // to the old one.
  const [prefill, setPrefill] = useState<{
    unit: string;
    low: string;
    high: string;
  } | null>(() => {
    const from = result
      ? {
          unit: result.unit,
          low: result.ref_range_low,
          high: result.ref_range_high,
        }
      : initial.seed;
    return from
      ? { unit: from.unit, low: text(from.low), high: text(from.high) }
      : null;
  });
  const [error, setError] = useState<string | null>(null);
  // The numbers the fields were filled in with, so a field left untouched is
  // saved as that exact number rather than re-read from its formatted text.
  const [origin, setOrigin] = useState<{
    value: number | null;
    low: number | null;
    high: number | null;
  }>({
    value: result?.value_numeric ?? null,
    low: result ? result.ref_range_low : (initial.seed?.low ?? null),
    high: result ? result.ref_range_high : (initial.seed?.high ?? null),
  });

  const options = useMemo(
    () => buildLabPickerOptions(markers, query, labels),
    [markers, query, labels]
  );

  const choose = (next: Picked) => {
    setPicked(next);
    const source = seedSource(next);
    const seed = {
      unit: source.unit,
      low: text(source.low),
      high: text(source.high),
    };
    setOrigin((prev) => ({ ...prev, low: source.low, high: source.high }));
    setUnit(seed.unit);
    setLow(seed.low);
    setHigh(seed.high);
    setPrefill(seed);
  };

  const submit = async () => {
    setError(null);
    const numeric = exactLabValue(value, origin.value);
    const lowBound = exactRangeBound(low, origin.low);
    const highBound = exactRangeBound(high, origin.high);
    // A result saved as text only (such as "Negative") has no number to show;
    // its other fields can still be edited, and the text is left as it is.
    const textOnly =
      result != null &&
      result.value_numeric === null &&
      result.value_text != null &&
      value.trim() === '';
    if ((numeric === null && !textOnly) || (!picked && !result)) {
      setError(t('labs.valueInvalid', 'Enter a marker and a numeric result.'));
      return;
    }
    if (
      !lowBound.ok ||
      !highBound.ok ||
      (lowBound.value !== null &&
        highBound.value !== null &&
        lowBound.value > highBound.value)
    ) {
      setError(
        t(
          'labs.rangeInvalid',
          'Enter numbers, with the low value not above the high value.'
        )
      );
      return;
    }
    if (!isDayString(date)) {
      setError(t('labs.dateInvalid', 'Enter the date of the test.'));
      return;
    }
    if (date > todayInZone(timezone)) {
      setError(t('labs.dateFuture', 'The test date cannot be in the future.'));
      return;
    }

    // A range filled in for one unit is not saved under another unit.
    const range = dropStalePrefilledRange(
      { unit, low, high },
      prefill,
      picked?.kind === 'builtin' ? picked.key : null
    );
    const rangeLow = exactRangeBound(range.low, origin.low);
    const rangeHigh = exactRangeBound(range.high, origin.high);
    const common = {
      entry_date: date,
      // Left out for a text-only result, so its text is kept.
      ...(textOnly ? {} : { value_numeric: numeric }),
      // A number typed for a result saved as text replaces that text.
      ...(!textOnly && result?.value_text != null ? { value_text: null } : {}),
      unit: unit.trim(),
      ref_range_low: rangeLow.ok ? rangeLow.value : null,
      ref_range_high: rangeHigh.ok ? rangeHigh.value : null,
      lab_name: labName.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      if (result) {
        await saveResult.mutateAsync({ id: result.id, body: common });
      } else if (picked) {
        let body: CreateLabResultBody;
        if (picked.kind === 'builtin') {
          body = {
            ...common,
            marker_key: picked.key,
            source: 'manual',
          } as CreateLabResultBody;
        } else if (picked.kind === 'custom') {
          body = {
            ...common,
            custom_marker_id: picked.id,
            source: 'manual',
          } as CreateLabResultBody;
        } else {
          // A new marker is created with the result in one server write, so a
          // failed save leaves no empty marker and a retry simply sends it again.
          body = {
            ...common,
            custom_marker_name: picked.name,
            source: 'manual',
          } as CreateLabResultBody;
        }
        await saveResult.mutateAsync({ body });
      }
      onOpenChange(false);
    } catch {
      // The mutation's toast reports it; keep the form open for another try.
    }
  };

  const busy = saveResult.isPending;
  const typed = query.trim();
  const canCreate =
    typed !== '' &&
    !options.some(
      (o) =>
        (o.kind === 'custom'
          ? o.marker.name
          : labPresetName(o.preset, labels)
        ).toLowerCase() === typed.toLowerCase()
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {result ? picked?.name : t('labs.add', 'Add lab result')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!result && !picked && (
            <div className="space-y-2">
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(
                  'labs.searchPlaceholder',
                  'Search markers (HbA1c, LDL, ...)'
                )}
                aria-label={t('labs.searchPlaceholder', 'Search markers')}
              />
              <ul className="max-h-56 overflow-y-auto rounded-md border divide-y">
                {options.map((option) => {
                  const name =
                    option.kind === 'custom'
                      ? option.marker.name
                      : labPresetName(option.preset, labels);
                  return (
                    <li
                      key={
                        option.kind === 'custom'
                          ? option.marker.id
                          : option.preset.key
                      }
                    >
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() =>
                          choose(
                            option.kind === 'custom'
                              ? {
                                  kind: 'custom',
                                  id: option.marker.markerId as string,
                                  name,
                                }
                              : {
                                  kind: 'builtin',
                                  key: option.preset.key,
                                  name,
                                }
                          )
                        }
                      >
                        {name}
                      </button>
                    </li>
                  );
                })}
                {canCreate && (
                  <li>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm font-medium hover:bg-accent"
                      onClick={() => choose({ kind: 'new', name: typed })}
                    >
                      {t(
                        'labs.createCustom',
                        'Add "{{name}}" as a new marker',
                        {
                          name: typed,
                        }
                      )}
                    </button>
                  </li>
                )}
                {options.length === 0 && !canCreate && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    {t('labs.noMatches', 'No matching markers')}
                  </li>
                )}
              </ul>
            </div>
          )}

          {(picked || result) && (
            <>
              {!result && picked && (
                <div className="flex items-center justify-between">
                  <span className="font-medium">{picked.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPicked(null)}
                  >
                    {t('labs.changeMarker', 'Change')}
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="lab-date">
                    {t('labs.date', 'Date of test')}
                  </Label>
                  <Input
                    id="lab-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lab-value">{t('labs.value', 'Result')}</Label>
                  <Input
                    id="lab-value"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lab-unit">{t('labs.unit', 'Unit')}</Label>
                  <Input
                    id="lab-unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lab-lab">{t('labs.labName', 'Lab')}</Label>
                  <Input
                    id="lab-lab"
                    value={labName}
                    onChange={(e) => setLabName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>
                  {t('labs.rangeOptional', 'Reference range (optional)')}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    aria-label={t('labs.rangeLow', 'Low')}
                    placeholder={t('labs.rangeLow', 'Low')}
                    inputMode="decimal"
                    value={low}
                    onChange={(e) => setLow(e.target.value)}
                  />
                  <Input
                    aria-label={t('labs.rangeHigh', 'High')}
                    placeholder={t('labs.rangeHigh', 'High')}
                    inputMode="decimal"
                    value={high}
                    onChange={(e) => setHigh(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'labs.rangeFromReport',
                    'Use the range printed on your report. It is saved with this result.'
                  )}
                </p>
              </div>
              <Textarea
                aria-label={t('labs.notes', 'Notes')}
                placeholder={t(
                  'labs.notesPlaceholder',
                  'Add a note (optional)'
                )}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={busy || (!picked && !result)}>
            {busy ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LabResultDialog;
