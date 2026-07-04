import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Scale, HeartPulse, Pill, Check, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCreateMedicationEntryMutation,
  useDeleteMedicationEntryMutation,
} from '@/hooks/useMedications';
import {
  useSaveCheckInMeasurementsMutation,
  useCustomCategories,
  useCreateCustomCategoryMutation,
  useSaveCustomMeasurementMutation,
} from '@/hooks/CheckIn/useCheckIn';
import type { PregnancyVitals } from '@/hooks/usePregnancy';

interface VitalsCardProps {
  pregnancyId: string;
  vitals: PregnancyVitals | null;
  date: string;
}

export default function VitalsCard({
  pregnancyId: _pregnancyId,
  vitals,
  date,
}: VitalsCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const createMedEntry = useCreateMedicationEntryMutation();
  const deleteMedEntry = useDeleteMedicationEntryMutation();
  const saveWeight = useSaveCheckInMeasurementsMutation();
  const createCategory = useCreateCustomCategoryMutation();
  const saveCustom = useSaveCustomMeasurementMutation();
  const { data: customCategories } = useCustomCategories();

  const [weightInput, setWeightInput] = useState('');
  const [isEditingWeight, setIsEditingWeight] = useState(false);

  const [bpInput, setBpInput] = useState('');
  const [isEditingBp, setIsEditingBp] = useState(false);

  if (!vitals) return null;

  const handleMedToggle = async (med: {
    id: string;
    entryId: string | null;
    loggedToday: boolean;
  }) => {
    if (med.loggedToday && med.entryId) {
      deleteMedEntry.mutate(med.entryId, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
        },
      });
    } else {
      createMedEntry.mutate(
        {
          medication_id: med.id,
          entry_date: date,
          status: 'taken',
          taken_at: new Date().toISOString(),
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
          },
        }
      );
    }
  };

  const handleWeightSave = () => {
    const w = parseFloat(weightInput);
    if (isNaN(w) || w <= 0) return;

    saveWeight.mutate(
      {
        entry_date: date,
        weight: w,
      },
      {
        onSuccess: () => {
          setIsEditingWeight(false);
          setWeightInput('');
          queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
        },
      }
    );
  };

  const handleBpSave = async () => {
    if (!bpInput.trim()) return;

    try {
      // Find or create BP custom category
      let bpCat = customCategories?.find(
        (c) =>
          c.name.toLowerCase() === 'blood_pressure' ||
          c.name.toLowerCase() === 'blood pressure'
      );

      if (!bpCat) {
        // Create custom category first
        bpCat = await createCategory.mutateAsync({
          name: 'blood_pressure',
          display_name: 'Blood Pressure',
          measurement_type: 'text',
          data_type: 'text',
        });
      }

      if (bpCat?.id) {
        await saveCustom.mutateAsync({
          category_id: bpCat.id,
          value: bpInput,
          entry_date: date,
        });
        setIsEditingBp(false);
        setBpInput('');
        queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
      }
    } catch (e) {
      console.error('Failed to save blood pressure custom measurement', e);
    }
  };

  const getWeightGainBadge = (status: typeof vitals.weightGainStatus) => {
    switch (status) {
      case 'within_range':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-transparent">
            {t('pregnancy.vitals.weight.withinRange', 'Within typical range')}
          </Badge>
        );
      case 'below_range':
        return (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border-transparent">
            {t('pregnancy.vitals.weight.belowRange', 'Below typical range')}
          </Badge>
        );
      case 'above_range':
        return (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border-transparent">
            {t('pregnancy.vitals.weight.aboveRange', 'Above typical range')}
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {t('pregnancy.vitals.title', 'Maternal Vitals')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Prenatal Supplement Quick-Log */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('pregnancy.vitals.prenatalSupplements', 'Prenatal Supplements')}
          </p>

          {!vitals.prenatalMedication && !vitals.supplementMedication ? (
            <p className="text-xs text-muted-foreground">
              {t(
                'pregnancy.vitals.noPrenatalsLinked',
                'No prenatal medications linked. Link medications in settings to track compliance.'
              )}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {vitals.prenatalMedication && (
                <button
                  type="button"
                  onClick={() => handleMedToggle(vitals.prenatalMedication!)}
                  disabled={
                    createMedEntry.isPending || deleteMedEntry.isPending
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-xl border p-3 text-left text-xs transition',
                    vitals.prenatalMedication.loggedToday
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
                      : 'border-muted bg-muted/40 hover:bg-muted text-muted-foreground'
                  )}
                >
                  <Pill className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {vitals.prenatalMedication.name}
                    </p>
                    <p className="text-[10px] mt-0.5">
                      {vitals.prenatalMedication.loggedToday
                        ? t('pregnancy.vitals.meds.taken', 'Taken today')
                        : t('pregnancy.vitals.meds.notTaken', 'Log dose')}
                    </p>
                  </div>
                  {vitals.prenatalMedication.loggedToday && (
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  )}
                </button>
              )}

              {vitals.supplementMedication && (
                <button
                  type="button"
                  onClick={() => handleMedToggle(vitals.supplementMedication!)}
                  disabled={
                    createMedEntry.isPending || deleteMedEntry.isPending
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-xl border p-3 text-left text-xs transition',
                    vitals.supplementMedication.loggedToday
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
                      : 'border-muted bg-muted/40 hover:bg-muted text-muted-foreground'
                  )}
                >
                  <Pill className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {vitals.supplementMedication.name}
                    </p>
                    <p className="text-[10px] mt-0.5">
                      {vitals.supplementMedication.loggedToday
                        ? t('pregnancy.vitals.meds.taken', 'Taken today')
                        : t('pregnancy.vitals.meds.notTaken', 'Log dose')}
                    </p>
                  </div>
                  {vitals.supplementMedication.loggedToday && (
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Weight Tracker */}
        <div className="rounded-xl border border-muted/55 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Scale className="h-4 w-4 text-primary/70" />
              {t('pregnancy.vitals.weight.title', 'Maternal Weight')}
            </span>
            {!isEditingWeight ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs font-medium gap-1"
                onClick={() => {
                  setWeightInput(
                    vitals.latestWeight ? String(vitals.latestWeight) : ''
                  );
                  setIsEditingWeight(true);
                }}
              >
                <Edit2 className="h-3 w-3" />
                {vitals.latestWeight
                  ? t('pregnancy.vitals.edit', 'Edit')
                  : t('pregnancy.vitals.log', 'Log')}
              </Button>
            ) : null}
          </div>

          {isEditingWeight ? (
            <div className="flex items-center gap-2 py-1">
              <Input
                type="number"
                step="0.1"
                placeholder="Weight in kg"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="h-8 text-xs max-w-[120px]"
              />
              <Button
                size="sm"
                className="h-8 text-xs px-3"
                onClick={handleWeightSave}
              >
                {t('pregnancy.vitals.save', 'Save')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs px-2"
                onClick={() => setIsEditingWeight(false)}
              >
                {t('pregnancy.vitals.cancel', 'Cancel')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold">
                  {vitals.latestWeight ? `${vitals.latestWeight} kg` : '-- kg'}
                </span>
                {vitals.weightDelta != null && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    {vitals.weightDelta >= 0
                      ? `+${vitals.weightDelta}`
                      : vitals.weightDelta}{' '}
                    kg {t('pregnancy.vitals.weight.sinceStart', 'since start')}
                  </span>
                )}
              </div>

              {vitals.gainRange && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-muted/30 pt-2 text-xs">
                  <span className="text-muted-foreground">
                    {t(
                      'pregnancy.vitals.weight.iomRange',
                      'IOM Range (Wk {{wk}}):',
                      {
                        wk: vitals.gainRange.lowKg
                          ? Math.round(vitals.gainRange.lowKg)
                          : 0, // Placeholder week just to translate
                      }
                    )}{' '}
                    <strong className="text-foreground">
                      {vitals.gainRange.lowKg} – {vitals.gainRange.highKg} kg
                    </strong>
                  </span>
                  {getWeightGainBadge(vitals.weightGainStatus)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Blood Pressure Tracker */}
        <div className="rounded-xl border border-muted/55 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <HeartPulse className="h-4 w-4 text-red-500/70" />
              {t('pregnancy.vitals.bp.title', 'Blood Pressure')}
            </span>
            {!isEditingBp ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs font-medium gap-1"
                onClick={() => {
                  setBpInput(vitals.bpValue ?? '');
                  setIsEditingBp(true);
                }}
              >
                <Edit2 className="h-3 w-3" />
                {vitals.bpValue
                  ? t('pregnancy.vitals.edit', 'Edit')
                  : t('pregnancy.vitals.log', 'Log')}
              </Button>
            ) : null}
          </div>

          {isEditingBp ? (
            <div className="flex items-center gap-2 py-1">
              <Input
                type="text"
                placeholder="e.g. 120/80"
                value={bpInput}
                onChange={(e) => setBpInput(e.target.value)}
                className="h-8 text-xs max-w-[120px]"
              />
              <Button
                size="sm"
                className="h-8 text-xs px-3"
                onClick={handleBpSave}
              >
                {t('pregnancy.vitals.save', 'Save')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs px-2"
                onClick={() => setIsEditingBp(false)}
              >
                {t('pregnancy.vitals.cancel', 'Cancel')}
              </Button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold">
                {vitals.bpValue ? `${vitals.bpValue} mmHg` : '--/-- mmHg'}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
