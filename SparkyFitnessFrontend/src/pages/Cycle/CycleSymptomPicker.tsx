import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BUILT_IN_CYCLE_SYMPTOMS,
  SYMPTOM_CATEGORY_COLOR,
  type SharedSymptomEntry,
  type SharedUserCustomSymptom,
} from '@workspace/shared';
import {
  useSymptomEntries,
  useCreateSymptomEntryMutation,
  useDeleteSymptomEntryMutation,
  useCustomSymptoms,
  useCreateCustomSymptomMutation,
  useDeleteCustomSymptomMutation,
} from '@/hooks/useSymptoms';
import {
  useDisplayPreferences,
  useUpsertDisplayPreferencesMutation,
} from '@/hooks/useCycle';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Settings, Trash } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import CycleIcon from './CycleIcon';

interface CycleSymptomPickerProps {
  date: string;
}

function normalizeSymptomKey(str: string): string {
  return str.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Cycle symptom logging: pill toggles (predefined + custom) + one severity
 * slider. Writes rows to `symptom_entries` with source='cycle', which feed the
 * Insights symptom-pattern heatmap and forecasting.
 */
export default function CycleSymptomPicker({ date }: CycleSymptomPickerProps) {
  const { t } = useTranslation();
  const { data: entries } = useSymptomEntries({ fromDate: date, toDate: date });
  const { data: customSymptoms } = useCustomSymptoms();
  const createEntry = useCreateSymptomEntryMutation();
  const deleteEntry = useDeleteSymptomEntryMutation();
  const [severity, setSeverity] = useState(3);

  const updateSymptomPrefs = useUpsertDisplayPreferencesMutation('symptoms');
  const createCustomSymptom = useCreateCustomSymptomMutation();
  const deleteCustomSymptom = useDeleteCustomSymptomMutation();

  const [newSymptomName, setNewSymptomName] = useState('');

  const handleToggleSymptomVisibility = async (
    value: string,
    isVisible: boolean
  ) => {
    const defaultVals = BUILT_IN_CYCLE_SYMPTOMS.map((s) => s.name);
    const baseEnabled =
      enabledSymptomItems.length === 0 ? defaultVals : enabledSymptomItems;
    const nextEnabled = isVisible
      ? [...baseEnabled, value]
      : baseEnabled.filter((v) => v !== value);
    await updateSymptomPrefs.mutateAsync({
      enabled_items: nextEnabled,
      custom_items: [],
    });
  };

  const handleAddCustomSymptom = async () => {
    if (!newSymptomName.trim()) return;
    try {
      const name = newSymptomName.trim();
      const created = await createCustomSymptom.mutateAsync({
        name,
        display_name: name,
      });

      const value = created.name;
      const defaultVals = BUILT_IN_CYCLE_SYMPTOMS.map((s) => s.name);
      const baseEnabled =
        enabledSymptomItems.length === 0 ? defaultVals : enabledSymptomItems;
      const nextEnabled = [...baseEnabled, value];

      await updateSymptomPrefs.mutateAsync({
        enabled_items: nextEnabled,
        custom_items: [],
      });
      setNewSymptomName('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCustomSymptom = async (value: string) => {
    try {
      const dbSymptom = customSymptoms?.find(
        (cs) => cs.name.toLowerCase() === value.toLowerCase()
      );
      if (dbSymptom?.id) {
        await deleteCustomSymptom.mutateAsync(dbSymptom.id);
      }
      const defaultVals = BUILT_IN_CYCLE_SYMPTOMS.map((s) => s.name);
      const baseEnabled =
        enabledSymptomItems.length === 0 ? defaultVals : enabledSymptomItems;
      const nextEnabled = baseEnabled.filter((v) => v !== value);
      await updateSymptomPrefs.mutateAsync({
        enabled_items: nextEnabled,
        custom_items: [],
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Map of symptom name -> logged cycle entries for this day.
  const loggedByName = (() => {
    const map = new Map<string, SharedSymptomEntry[]>();
    for (const e of (entries ?? []) as SharedSymptomEntry[]) {
      if ((e.source ?? 'manual') !== 'cycle') continue;
      const key = normalizeSymptomKey(e.symptom_name_snapshot ?? '');
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  })();

  const toggle = (name: string, displayName: string) => {
    const keyName = normalizeSymptomKey(name);
    const keyDisplayName = normalizeSymptomKey(displayName);
    const existing =
      loggedByName.get(keyName) ?? loggedByName.get(keyDisplayName);
    if (existing && existing.length > 0) {
      existing.forEach((e) => e.id && deleteEntry.mutate(e.id));
    } else {
      createEntry.mutate({
        symptom_name_snapshot: displayName,
        severity,
        source: 'cycle',
        entry_date: date,
      });
    }
  };

  const { data: symptomPrefs } = useDisplayPreferences('symptoms');
  const enabledSymptomItems = symptomPrefs?.enabled_items ?? [];

  const visibleBuiltInSymptoms =
    enabledSymptomItems.length === 0
      ? BUILT_IN_CYCLE_SYMPTOMS
      : BUILT_IN_CYCLE_SYMPTOMS.filter((s) =>
          enabledSymptomItems.includes(s.name)
        );

  const customList = (customSymptoms ?? []) as SharedUserCustomSymptom[];
  const visibleCustomSymptoms =
    enabledSymptomItems.length === 0
      ? customList
      : customList.filter((s) => enabledSymptomItems.includes(s.name));

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">
          {t('cycle.log.symptoms', 'Symptoms')}
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              aria-label={t(
                'cycle.log.customizeSymptoms',
                'Customize Symptoms'
              )}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {t('settings.cycle.customizeSymptoms', 'Customize Symptoms')}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                {t(
                  'settings.cycle.customizeSymptomsDesc',
                  'Show or hide symptoms in your cycle log, or add new ones.'
                )}
              </p>

              {/* Default Symptoms Toggles (scrollable list) */}
              <div className="max-h-60 overflow-y-auto border rounded-lg p-2 bg-background font-sans">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {BUILT_IN_CYCLE_SYMPTOMS.map((s) => {
                    const isVisible =
                      enabledSymptomItems.length === 0 ||
                      enabledSymptomItems.includes(s.name);
                    return (
                      <div
                        key={s.name}
                        onClick={() =>
                          handleToggleSymptomVisibility(s.name, !isVisible)
                        }
                        className={cn(
                          'flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-pointer select-none transition',
                          isVisible
                            ? 'border-primary bg-primary/5 font-medium text-foreground'
                            : 'border-muted bg-transparent text-muted-foreground hover:bg-muted/30'
                        )}
                      >
                        <Checkbox
                          checked={isVisible}
                          onCheckedChange={() =>
                            handleToggleSymptomVisibility(s.name, !isVisible)
                          }
                          className="pointer-events-none"
                        />
                        <span>{s.displayName}</span>
                      </div>
                    );
                  })}
                  {/* Custom Symptoms Toggles */}
                  {((customSymptoms ?? []) as SharedUserCustomSymptom[]).map(
                    (cs) => {
                      const val = cs.name;
                      const isVisible = enabledSymptomItems.includes(val);
                      const dn = cs.display_name ?? cs.name;
                      return (
                        <div
                          key={cs.id}
                          className={cn(
                            'flex items-center justify-between p-1.5 rounded-lg border text-xs transition',
                            isVisible
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-muted bg-transparent text-muted-foreground'
                          )}
                        >
                          <div
                            onClick={() =>
                              handleToggleSymptomVisibility(val, !isVisible)
                            }
                            className="flex items-center gap-2 cursor-pointer select-none flex-1"
                          >
                            <Checkbox
                              checked={isVisible}
                              onCheckedChange={() =>
                                handleToggleSymptomVisibility(val, !isVisible)
                              }
                              className="pointer-events-none"
                            />
                            <span>{dn}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomSymptom(val);
                            }}
                          >
                            <Trash className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Add Custom Symptom Form */}
              <div className="flex gap-2 items-end bg-muted/20 p-3 rounded-lg border">
                <div className="space-y-1 flex-1">
                  <Label
                    htmlFor="custom-symp-name"
                    className="text-[10px] uppercase font-bold text-muted-foreground"
                  >
                    Symptom Name
                  </Label>
                  <Input
                    id="custom-symp-name"
                    placeholder="e.g. Fatigue"
                    value={newSymptomName}
                    onChange={(e) => setNewSymptomName(e.target.value)}
                    className="h-8 text-xs w-full"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleAddCustomSymptom}
                >
                  Add
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-wrap gap-2">
        {visibleBuiltInSymptoms.map((s) => {
          const keyName = normalizeSymptomKey(s.name);
          const keyDisplayName = normalizeSymptomKey(s.displayName);
          const active =
            loggedByName.has(keyName) || loggedByName.has(keyDisplayName);
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => toggle(s.name, s.displayName)}
              aria-pressed={active}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
                active
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'border-transparent bg-muted/40 hover:bg-muted'
              )}
            >
              <CycleIcon id={s.icon} size={20} title={s.displayName} />
              {s.displayName}
            </button>
          );
        })}
        {visibleCustomSymptoms.map((s) => {
          const dn = s.display_name ?? s.name;
          const keyName = normalizeSymptomKey(s.name);
          const keyDisplayName = normalizeSymptomKey(dn);
          const active =
            loggedByName.has(keyName) || loggedByName.has(keyDisplayName);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.name, dn)}
              aria-pressed={active}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
                active
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'border-transparent bg-muted/40 hover:bg-muted'
              )}
            >
              <CycleIcon id="symptom-cramps" size={20} title={dn} />
              {dn}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('cycle.log.severity', 'Severity for new symptoms')}</span>
          <span className="font-medium tabular-nums">{severity} / 5</span>
        </div>
        <Slider
          min={1}
          max={5}
          step={1}
          value={[severity]}
          onValueChange={(v) => setSeverity(v[0] ?? 3)}
          aria-label={t('cycle.log.severity', 'Symptom severity')}
        />
      </div>
      {/* Category color legend keeps the palette meaningful. */}
      <p className="sr-only">
        {Object.keys(SYMPTOM_CATEGORY_COLOR).join(', ')}
      </p>
    </section>
  );
}
