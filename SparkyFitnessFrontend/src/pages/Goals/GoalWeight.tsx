import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import { useSetTargetWeight } from '@/hooks/Onboarding/useOnboarding';
import { kgToLbs, lbsToKg } from '@/utils/unitConversions';

/** Largest goal the server accepts: the `numeric(5,2)` column's maximum. */
const MAX_GOAL_WEIGHT_KG = 999.99;

export const GoalWeight = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { weightUnit } = usePreferences();
  const userId = user?.id ?? '';
  const { data: profile } = useProfileQuery(userId);
  const { mutateAsync: saveTargetWeight, isPending: saving } =
    useSetTargetWeight(userId);

  // Stones and pounds users enter pounds; storage is always kilograms.
  const inputUnit = weightUnit === 'kg' ? 'kg' : 'lbs';
  const savedKg = Number(profile?.target_weight);
  const savedDisplay =
    Number.isFinite(savedKg) && savedKg > 0
      ? Number(
          (inputUnit === 'kg' ? savedKg : kgToLbs(savedKg)).toFixed(1)
        ).toString()
      : '';

  // `null` means the user has not edited; show what is saved. A draft keeps
  // the unit it was typed in, so changing the unit preference while it is
  // unsaved converts it instead of reading the same number in the new unit.
  const [draft, setDraft] = useState<{
    text: string;
    unit: 'kg' | 'lbs';
  } | null>(null);
  const draftNumber = draft == null ? NaN : Number(draft.text);
  const value =
    draft == null
      ? savedDisplay
      : draft.unit === inputUnit || !Number.isFinite(draftNumber)
        ? draft.text
        : Number(
            (inputUnit === 'kg'
              ? lbsToKg(draftNumber)
              : kgToLbs(draftNumber)
            ).toFixed(1)
          ).toString();
  const parsed = Number(value);
  const parsedKg = inputUnit === 'kg' ? parsed : lbsToKg(parsed);
  // The server stores NUMERIC(5,2), so anything above 999.99 kg is refused.
  const maxDisplay =
    inputUnit === 'kg'
      ? MAX_GOAL_WEIGHT_KG
      : Math.floor(kgToLbs(MAX_GOAL_WEIGHT_KG) * 10) / 10;
  const isValid =
    value.trim() !== '' &&
    Number.isFinite(parsed) &&
    Math.round(parsedKg * 100) / 100 > 0 &&
    parsedKg <= MAX_GOAL_WEIGHT_KG;

  const handleSave = async () => {
    if (!isValid) return;
    await saveTargetWeight(parsedKg);
    setDraft(null);
  };

  const handleClear = async () => {
    await saveTargetWeight(null);
    setDraft(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('goals.goalsSettings.goalWeight', 'Goal Weight')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'goals.goalsSettings.goalWeightDescription',
            'Your target weight. The weight trend chart uses it to project when you will reach it.'
          )}
        </p>
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="goal-weight" className="text-xs">
            {t('goals.goalsSettings.goalWeightInputLabel', {
              unit: inputUnit,
              defaultValue: 'Goal weight ({{unit}})',
            })}
          </Label>
          <Input
            id="goal-weight"
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            value={value}
            onChange={(e) =>
              setDraft({ text: e.target.value, unit: inputUnit })
            }
          />
          {draft !== null && !isValid && draft.text.trim() !== '' && (
            <p className="text-xs text-destructive">
              {t('goals.goalsSettings.goalWeightInvalid', {
                max: maxDisplay,
                unit: inputUnit,
                defaultValue:
                  'Enter a weight above zero and up to {{max}} {{unit}}.',
              })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving || draft === null || !isValid}
          >
            {t('goals.goalsSettings.goalWeightSave', 'Save goal weight')}
          </Button>
          {savedDisplay !== '' && (
            <Button variant="outline" onClick={handleClear} disabled={saving}>
              {t('goals.goalsSettings.goalWeightClear', 'Clear')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
