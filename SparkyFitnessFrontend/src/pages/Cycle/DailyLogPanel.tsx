import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FLOW_LEVELS,
  PERIOD_PRODUCTS,
  CERVICAL_MUCUS_TYPES,
  type SharedCycleDailyLog,
  type FlowLevel,
  type ProductDef,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Check, Minus, Plus, Settings, Trash, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import CycleIcon from './CycleIcon';
import CycleSymptomPicker from './CycleSymptomPicker';
import {
  useUpsertDailyLogMutation,
  useCycleSettings,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import IntercourseLog from './ttc/IntercourseLog';
import CervicalPositionPicker from './ttc/CervicalPositionPicker';
import { useLatestCheckInMeasurements } from '@/hooks/CheckIn/useCheckIn';
import { useSleepEntriesQuery } from '@/hooks/CheckIn/useSleep';
import { useWaterIntakeQuery } from '@/hooks/Diary/useWaterIntake';

interface DailyLogPanelProps {
  date: string;
  log: SharedCycleDailyLog | null;
  preferredProducts?: string[];
}

type Draft = {
  flow_level: FlowLevel | null;
  product_usage: Record<string, number>;
  cervical_mucus: string | null;
  energy: number | null;
  notes: string | null;
  intercourse: boolean | null;
  intercourse_protected: boolean | null;
  cervical_position: string | null;
};

function toDraft(log: SharedCycleDailyLog | null): Draft {
  return {
    flow_level: log?.flow_level ?? null,
    product_usage: log?.product_usage ?? {},
    cervical_mucus: log?.cervical_mucus ?? null,
    energy: log?.energy ?? null,
    notes: log?.notes ?? null,
    intercourse: log?.intercourse ?? null,
    intercourse_protected: log?.intercourse_protected ?? null,
    cervical_position: log?.cervical_position ?? null,
  };
}

export default function DailyLogPanel(props: DailyLogPanelProps) {
  const { date, log } = props;
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(() => toDraft(log));
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upsert = useUpsertDailyLogMutation();
  const { data: settings } = useCycleSettings();
  const isTtc = settings?.mode === 'ttc';

  const checkInQuery = useLatestCheckInMeasurements(date);
  const sleepQuery = useSleepEntriesQuery(date, date);
  const waterQuery = useWaterIntakeQuery(date);

  const waterMl = waterQuery.data ?? 0;
  const sleepEntries = sleepQuery.data ?? [];
  const totalSleepSeconds = sleepEntries.reduce((sum, entry) => {
    return (
      sum + (entry.time_asleep_in_seconds ?? entry.duration_in_seconds ?? 0)
    );
  }, 0);
  const totalSleepHours = totalSleepSeconds / 3600;

  // Reseed when the day (or its server value) changes.
  useEffect(() => {
    setDraft(toDraft(log));
  }, [date, log]);

  const save = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      upsert.mutate({ date, body: patch }, { onSuccess: () => setSaved(true) });
    }, 400);
  };

  const [showAllProducts, setShowAllProducts] = useState(false);

  const updateProductPrefs = useUpsertDisplayPreferencesMutation('products');
  const [newProductName, setNewProductName] = useState('');
  const [newProductCapacity, setNewProductCapacity] = useState(5);

  const handleToggleProductVisibility = async (
    value: string,
    isVisible: boolean
  ) => {
    const defaultVals = PERIOD_PRODUCTS.map((p) => p.value);
    const baseEnabled = enabledItems.length === 0 ? defaultVals : enabledItems;
    const nextEnabled = isVisible
      ? [...baseEnabled, value]
      : baseEnabled.filter((v) => v !== value);
    await updateProductPrefs.mutateAsync({
      enabled_items: nextEnabled,
      custom_items: customItems,
    });
  };

  const handleAddCustomProduct = async () => {
    if (!newProductName.trim()) return;
    // eslint-disable-next-line react-hooks/purity
    const value = `custom_prod_${Date.now()}`;
    const newProduct = {
      value,
      displayName: newProductName.trim(),
      capacityMl: Number(newProductCapacity) || 5,
    };
    const nextCustom = [...customItems, newProduct];
    const defaultVals = PERIOD_PRODUCTS.map((p) => p.value);
    const baseEnabled = enabledItems.length === 0 ? defaultVals : enabledItems;
    const nextEnabled = [...baseEnabled, value];

    await updateProductPrefs.mutateAsync({
      enabled_items: nextEnabled,
      custom_items: nextCustom,
    });
    setNewProductName('');
  };

  const handleDeleteCustomProduct = async (value: string) => {
    const nextCustom = customItems.filter((p) => p.value !== value);
    const defaultVals = PERIOD_PRODUCTS.map((p) => p.value);
    const baseEnabled = enabledItems.length === 0 ? defaultVals : enabledItems;
    const nextEnabled = baseEnabled.filter((v) => v !== value);
    await updateProductPrefs.mutateAsync({
      enabled_items: nextEnabled,
      custom_items: nextCustom,
    });
  };

  const { data: productPrefs } = useDisplayPreferences('products');
  const enabledItems = productPrefs?.enabled_items ?? [
    'pad',
    'tampon',
    'cup',
    'liner',
    'period_underwear',
    'disc',
  ];

  const customItems = productPrefs?.custom_items ?? [];

  const allProducts: ProductDef[] = [
    ...PERIOD_PRODUCTS,
    ...customItems.map((c) => ({
      value: c.value,
      displayName: c.displayName,
      icon: 'product-cup',
      color: 'period',
      capacityMl: c.capacityMl ?? 5,
    })),
  ];

  const activeProducts = allProducts.filter((p) =>
    enabledItems.includes(p.value)
  );
  const visibleProductsList = showAllProducts ? allProducts : activeProducts;
  const visibleProducts = visibleProductsList.map((p) => p.value);

  const setProduct = (value: string, count: number) => {
    const next = { ...draft.product_usage, [value]: Math.max(0, count) };
    if (next[value] === 0) delete next[value];
    save({ product_usage: next });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {t('cycle.log.title', "Today's log")}
        </CardTitle>
        {saved ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3 w-3" /> {t('cycle.log.saved', 'Saved')}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Daily-log glance row (water/sleep/weight read-only) */}
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-primary/5 p-3 text-xs border border-primary/10">
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
              {t('cycle.log.glance.water', 'Water')}
            </span>
            <span className="mt-0.5 font-semibold text-sm text-foreground">
              {waterQuery.isLoading ? '…' : `${waterMl} ml`}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center text-center border-x border-muted/50">
            <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
              {t('cycle.log.glance.sleep', 'Sleep')}
            </span>
            <span className="mt-0.5 font-semibold text-sm text-foreground">
              {sleepQuery.isLoading ? '…' : `${totalSleepHours.toFixed(1)} hrs`}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
              {t('cycle.log.glance.weight', 'Weight')}
            </span>
            <span className="mt-0.5 font-semibold text-sm text-foreground">
              {checkInQuery.isLoading
                ? '…'
                : checkInQuery.data?.weight
                  ? `${checkInQuery.data.weight} kg`
                  : '-- kg'}
            </span>
          </div>
        </div>

        {/* Flow */}
        <section>
          <p className="mb-2 text-sm font-medium">
            {t('cycle.log.flow', 'Flow')}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {FLOW_LEVELS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() =>
                  save({
                    flow_level: draft.flow_level === f.value ? null : f.value,
                  })
                }
                aria-pressed={draft.flow_level === f.value}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-2 text-xs transition',
                  draft.flow_level === f.value
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-transparent bg-muted/40 hover:bg-muted'
                )}
              >
                <CycleIcon id={f.icon} size={26} title={f.displayName} />
                {f.displayName}
              </button>
            ))}
          </div>
        </section>

        {/* Period products */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">
              {t('cycle.log.products', 'Period products')}
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  aria-label={t(
                    'cycle.log.customizeProducts',
                    'Customize Products'
                  )}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {t(
                      'settings.cycle.customizeProducts',
                      'Customize Period Products'
                    )}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'settings.cycle.customizeProductsDesc',
                      'Choose which period products appear in your daily logs or add your own.'
                    )}
                  </p>

                  {/* Default Products Toggles */}
                  <div className="space-y-1 pt-2">
                    {PERIOD_PRODUCTS.map((p) => {
                      const isVisible =
                        enabledItems.length === 0 ||
                        enabledItems.includes(p.value);
                      return (
                        <div
                          key={p.value}
                          className={cn(
                            'flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition',
                            !isVisible && 'opacity-50'
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-full bg-rose-400 dark:bg-rose-500" />
                            <span>{p.displayName}</span>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              handleToggleProductVisibility(p.value, !isVisible)
                            }
                            aria-label={
                              isVisible ? 'Hide product' : 'Show product'
                            }
                          >
                            {isVisible ? (
                              <Eye className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            )}
                          </Button>
                        </div>
                      );
                    })}
                    {/* Custom Products List */}
                    {customItems.map((cp) => {
                      const isVisible = enabledItems.includes(cp.value);
                      return (
                        <div
                          key={cp.value}
                          className={cn(
                            'flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition',
                            !isVisible && 'opacity-50'
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-full bg-rose-400 dark:bg-rose-500" />
                            <span>
                              {cp.displayName} ({cp.capacityMl}ml)
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() =>
                                handleToggleProductVisibility(
                                  cp.value,
                                  !isVisible
                                )
                              }
                              aria-label={
                                isVisible ? 'Hide product' : 'Show product'
                              }
                            >
                              {isVisible ? (
                                <Eye className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCustomProduct(cp.value);
                              }}
                              aria-label="Delete product"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Custom Product Form */}
                  <div className="flex flex-wrap gap-2 items-end bg-muted/20 p-3 rounded-lg border">
                    <div className="space-y-1 flex-1">
                      <Label
                        htmlFor="custom-prod-name"
                        className="text-[10px] uppercase font-bold text-muted-foreground"
                      >
                        Product Name
                      </Label>
                      <Input
                        id="custom-prod-name"
                        placeholder="e.g. Organic tampon"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        className="h-8 text-xs w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor="custom-prod-cap"
                        className="text-[10px] uppercase font-bold text-muted-foreground"
                      >
                        Capacity (ml)
                      </Label>
                      <Input
                        id="custom-prod-cap"
                        type="number"
                        min={1}
                        max={100}
                        value={newProductCapacity}
                        onChange={(e) =>
                          setNewProductCapacity(Number(e.target.value))
                        }
                        className="h-8 text-xs max-w-[80px]"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={handleAddCustomProduct}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-2">
            {visibleProducts.map((value: string) => {
              const def = allProducts.find((p) => p.value === value);
              if (!def) return null;
              const count = draft.product_usage[value] ?? 0;
              return (
                <div
                  key={value}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <CycleIcon
                      id={def.icon}
                      size={24}
                      title={def.displayName}
                    />
                    {def.displayName}
                  </span>
                  <span className="flex items-center gap-3">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Decrease ${def.displayName}`}
                      onClick={() => setProduct(value, count - 1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-5 text-center text-sm font-medium">
                      {count}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Increase ${def.displayName}`}
                      onClick={() => setProduct(value, count + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              );
            })}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => setShowAllProducts((v) => !v)}
            >
              {showAllProducts
                ? t('cycle.log.fewerProducts', 'Show fewer')
                : t('cycle.log.moreProducts', '+ more products')}
            </Button>
          </div>
        </section>

        {/* BBT is tracked via the basal_body_temperature custom measurement in
            Check-in (and can sync from mobile), then feeds cycle predictions. */}

        {/* Cervical mucus */}
        <section className="space-y-3">
          <p className="mb-2 text-sm font-medium">
            {t('cycle.log.mucus', 'Cervical mucus')}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {CERVICAL_MUCUS_TYPES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() =>
                  save({
                    cervical_mucus:
                      draft.cervical_mucus === m.value ? null : m.value,
                  })
                }
                aria-pressed={draft.cervical_mucus === m.value}
                title={m.description}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] transition',
                  draft.cervical_mucus === m.value
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-transparent bg-muted/40 hover:bg-muted'
                )}
              >
                <CycleIcon id={m.icon} size={22} title={m.displayName} />
                {m.displayName}
              </button>
            ))}
          </div>
          {isTtc && (
            <CervicalPositionPicker
              value={draft.cervical_position}
              onChange={(val) => save({ cervical_position: val })}
            />
          )}
        </section>

        {/* Mood now lives in the shared mood_entries model (Check-in / Reports). */}

        {/* Symptoms — feeds the Insights symptom-pattern heatmap */}
        <CycleSymptomPicker date={date} />

        {/* Energy */}
        <section>
          <p className="mb-2 text-sm font-medium">
            {t('cycle.log.energy', 'Energy')}: {draft.energy ?? '—'}
          </p>
          <Slider
            min={1}
            max={5}
            step={1}
            value={[draft.energy ?? 3]}
            onValueChange={(v) => save({ energy: v[0] ?? null })}
            aria-label="Energy level"
          />
        </section>

        {isTtc && (
          <section>
            <p className="mb-2 text-sm font-medium">
              {t('cycle.log.intercourseSection', 'Intercourse')}
            </p>
            <IntercourseLog
              value={draft.intercourse}
              protectedValue={draft.intercourse_protected}
              onChange={(val, prot) =>
                save({ intercourse: val, intercourse_protected: prot })
              }
            />
          </section>
        )}

        {/* Notes */}
        <section>
          <p className="mb-2 text-sm font-medium">
            {t('cycle.log.notes', 'Notes')}
          </p>
          <Textarea
            value={draft.notes ?? ''}
            onChange={(e) => save({ notes: e.target.value })}
            placeholder={t(
              'cycle.log.notesPlaceholder',
              'Anything else to note…'
            )}
            rows={2}
          />
        </section>
      </CardContent>
    </Card>
  );
}
