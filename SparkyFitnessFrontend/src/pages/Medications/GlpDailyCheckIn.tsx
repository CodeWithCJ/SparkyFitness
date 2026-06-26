import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Utensils, Brain, Soup, Zap, Activity } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { todayInZone } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { UpdateCustomMeasurementsRequest } from '@workspace/shared';
import {
  useCustomCategories,
  useExistingCustomMeasurements,
  useSaveCustomMeasurementMutation,
} from '@/hooks/CheckIn/useCheckIn';
import { useAddCategoryMutation } from '@/hooks/Settings/useCustomCategories';

// GLP-1 daily check-in metrics, stored as standard daily custom-measurement categories so they
// also flow into the Check-in page and Reports. `name` is the stable identifier we match on;
// `label` is the friendly display name.
const GLP_METRICS: {
  key: string;
  name: string;
  label: string;
  Icon: LucideIcon;
  color: string;
  chip: string;
}[] = [
  {
    key: 'hunger',
    name: 'GLP Hunger',
    label: 'Hunger',
    Icon: Utensils,
    color: 'text-orange-500',
    chip: 'bg-orange-100 dark:bg-orange-900/50',
  },
  {
    key: 'food_noise',
    name: 'GLP Food Noise',
    label: 'Food noise',
    Icon: Brain,
    color: 'text-violet-500',
    chip: 'bg-violet-100 dark:bg-violet-900/50',
  },
  {
    key: 'fullness',
    name: 'GLP Fullness',
    label: 'Fullness',
    Icon: Soup,
    color: 'text-emerald-500',
    chip: 'bg-emerald-100 dark:bg-emerald-900/50',
  },
  {
    key: 'energy',
    name: 'GLP Energy',
    label: 'Energy',
    Icon: Zap,
    color: 'text-amber-500',
    chip: 'bg-amber-100 dark:bg-amber-900/50',
  },
];

interface GlpDailyCheckInProps {
  selectedDate?: string;
}

export default function GlpDailyCheckIn({
  selectedDate,
}: GlpDailyCheckInProps = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const currentUserId = activeUserId || user?.id;
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);
  const targetDate = selectedDate || today;

  const { data: categories = [] } = useCustomCategories(currentUserId);
  const { data: existing = [] } = useExistingCustomMeasurements(targetDate);
  const { mutateAsync: saveMeasurement, isPending: saving } =
    useSaveCustomMeasurementMutation();
  const { mutateAsync: addCategory } = useAddCategoryMutation(
    currentUserId ?? undefined
  );

  const catByMetric = useMemo(() => {
    const map: Record<string, { id: string } | undefined> = {};
    for (const m of GLP_METRICS) {
      const found = categories.find((c) => c.name === m.name);
      map[m.key] = found ? { id: String(found.id) } : undefined;
    }
    return map;
  }, [categories]);

  const loadedValues = useMemo(() => {
    const v: Record<string, number> = {};
    for (const m of GLP_METRICS) {
      const cat = catByMetric[m.key];
      const found = cat
        ? existing.find((e) => String(e.category_id) === cat.id)
        : undefined;
      v[m.key] = found ? Number(found.value) : 5;
    }
    return v;
  }, [catByMetric, existing]);

  // Local edits layered over the stored values; cleared after a successful save so the sliders
  // reflect what was persisted. Deriving (instead of syncing stored data into state via useEffect)
  // avoids a render loop, since the query defaults produce fresh array identities each render.
  const [edits, setEdits] = useState<Record<string, number | undefined>>({});
  const valueFor = (key: string) => edits[key] ?? loadedValues[key] ?? 5;

  const handleSave = async () => {
    for (const m of GLP_METRICS) {
      let categoryId = catByMetric[m.key]?.id;
      if (!categoryId) {
        const created = await addCategory({
          name: m.name,
          display_name: m.label,
          measurement_type: 'score (0–10)',
          frequency: 'Daily',
          data_type: 'numeric',
        });
        categoryId = String(created.id);
      }
      const payload: UpdateCustomMeasurementsRequest = {
        category_id: categoryId,
        value: String(valueFor(m.key)),
        entry_date: targetDate,
        entry_hour: null,
        entry_timestamp: new Date().toISOString(),
        notes: '',
      };
      await saveMeasurement(payload);
    }
    setEdits({});
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900/50">
            <Activity className="h-3.5 w-3.5 text-pink-500" />
          </span>
          {t('medications.checkin.title', 'GLP-1 daily check-in')}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            'medications.checkin.subtitle',
            'Track how the medication is affecting you — saved to your daily measurements, so it also shows in Check-in & Reports.'
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GLP_METRICS.map((m) => (
            <div key={m.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${m.chip}`}
                  >
                    <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
                  </span>
                  {t('medications.checkin.metric.' + m.key, m.label)}
                </span>
                <span className="font-semibold tabular-nums">
                  {valueFor(m.key)}{' '}
                  <span className="text-muted-foreground">/ 10</span>
                </span>
              </div>
              <Slider
                min={0}
                max={10}
                step={1}
                value={[valueFor(m.key)]}
                onValueChange={([v]) =>
                  setEdits((prev) => ({ ...prev, [m.key]: v }))
                }
              />
            </div>
          ))}
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving
            ? t('medications.common.saving', 'Saving…')
            : targetDate === today
              ? t('medications.checkin.saveToday', "Save today's check-in")
              : t('medications.checkin.save', 'Save check-in')}
        </Button>
      </CardContent>
    </Card>
  );
}
