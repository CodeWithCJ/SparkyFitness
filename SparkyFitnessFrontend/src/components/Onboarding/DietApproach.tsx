import { Input } from '@/components/ui/input';
import { ChevronDown, Utensils, Lock, Unlock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { DIET_TEMPLATES, getDietTemplate } from '@/constants/dietTemplates';

type MacroKey = 'carbs' | 'protein' | 'fat';

const MACRO_CONTROLS = [
  {
    key: 'carbs',
    labelKey: 'onboarding.dietApproachCarbohydrates',
    min: 5,
    max: 80,
  },
  {
    key: 'protein',
    labelKey: 'onboarding.dietApproachProtein',
    min: 10,
    max: 50,
  },
  {
    key: 'fat',
    labelKey: 'onboarding.dietApproachFat',
    min: 10,
    max: 75,
  },
] as const satisfies ReadonlyArray<{
  key: MacroKey;
  labelKey: string;
  min: number;
  max: number;
}>;

export interface DietApproachProps {
  customPercentages: Record<MacroKey, number>;
  handleMacroValueChange: (changedMacro: MacroKey, newValue: number) => void;
  localSelectedDiet: string;
  lockedMacros: Record<MacroKey, boolean>;
  setCustomPercentages: React.Dispatch<
    React.SetStateAction<Record<MacroKey, number>>
  >;
  setLocalSelectedDiet: (newDiet: string) => void;
  setLockedMacros: React.Dispatch<
    React.SetStateAction<Record<MacroKey, boolean>>
  >;
  setShowDietApproach: React.Dispatch<React.SetStateAction<boolean>>;
  showDietApproach: boolean;
}

export const DietApproach = ({
  customPercentages,
  handleMacroValueChange,
  localSelectedDiet,
  lockedMacros,
  setCustomPercentages,
  setLocalSelectedDiet,
  setLockedMacros,
  setShowDietApproach,
  showDietApproach,
}: DietApproachProps) => {
  const { t } = useTranslation();
  const selectedTemplate = getDietTemplate(localSelectedDiet);
  const totalPercentage = MACRO_CONTROLS.reduce(
    (total, { key }) => total + Math.round(customPercentages[key]),
    0
  );

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setShowDietApproach(!showDietApproach)}
        className="flex w-full items-center justify-between rounded-2xl p-4 transition-colors hover:bg-muted"
        aria-expanded={showDietApproach}
        aria-controls="diet-approach-panel"
      >
        <span className="flex items-center gap-2">
          <Utensils className="h-5 w-5 text-green-500" aria-hidden="true" />
          <span className="font-semibold text-foreground">
            {t('onboarding.dietApproachTitle')}
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground transition-transform ${showDietApproach ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {showDietApproach && (
        <div
          id="diet-approach-panel"
          className="space-y-4 border-t border-border px-4 pb-4 pt-4"
        >
          <p className="mb-4 text-sm text-muted-foreground">
            {t('onboarding.dietApproachDescription')}
          </p>

          <Select
            value={localSelectedDiet}
            onValueChange={(value) => {
              setLocalSelectedDiet(value);
              if (value !== 'custom') {
                const template = getDietTemplate(value);
                if (template) {
                  setCustomPercentages({
                    carbs: template.carbsPercentage,
                    protein: template.proteinPercentage,
                    fat: template.fatPercentage,
                  });
                }
              }
            }}
          >
            <SelectTrigger
              className="w-full text-start"
              aria-label={t('onboarding.dietApproachChooseLabel')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIET_TEMPLATES.map((diet) => (
                <SelectItem key={diet.id} value={diet.id}>
                  <div className="text-start">
                    <div className="font-semibold">
                      {t(`onboarding.dietApproachTemplates.${diet.id}.name`)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('onboarding.dietApproachMacroSummary', {
                        carbs: diet.carbsPercentage,
                        protein: diet.proteinPercentage,
                        fat: diet.fatPercentage,
                      })}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTemplate && (
            <div className="mt-3 rounded-lg bg-muted p-3">
              <p className="text-sm text-foreground">
                {t(
                  `onboarding.dietApproachTemplates.${selectedTemplate.id}.description`
                )}
              </p>
            </div>
          )}

          {localSelectedDiet === 'custom' && (
            <div className="mt-6 space-y-6 rounded-lg border border-border bg-muted p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">
                  {t('onboarding.dietApproachCustomSplit')}
                </h4>
                <span
                  className={`text-sm font-mono ${
                    totalPercentage === 100
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                  aria-live="polite"
                >
                  {t('onboarding.dietApproachTotal', {
                    total: totalPercentage,
                  })}
                </span>
              </div>

              {MACRO_CONTROLS.map(({ key, labelKey, min, max }) => {
                const macroLabel = t(labelKey);
                const isLocked = lockedMacros[key];
                const lockLabel = t(
                  isLocked
                    ? 'onboarding.dietApproachUnlockMacro'
                    : 'onboarding.dietApproachLockMacro',
                  { macro: macroLabel }
                );
                const inputId = `diet-approach-${key}`;

                return (
                  <div key={key}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setLockedMacros((previous) => ({
                              ...previous,
                              [key]: !previous[key],
                            }))
                          }
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={lockLabel}
                          title={lockLabel}
                          aria-pressed={isLocked}
                        >
                          {isLocked ? (
                            <Lock size={16} aria-hidden="true" />
                          ) : (
                            <Unlock size={16} aria-hidden="true" />
                          )}
                        </button>
                        <label
                          htmlFor={inputId}
                          className="text-sm font-medium text-foreground"
                        >
                          {macroLabel}
                        </label>
                      </div>
                      <div className="flex items-center gap-2" dir="ltr">
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="numeric"
                          step={1}
                          min={min}
                          max={max}
                          value={Math.round(customPercentages[key])}
                          onChange={(event) =>
                            handleMacroValueChange(
                              key,
                              Number.parseInt(event.target.value, 10) || 0
                            )
                          }
                          className="h-8 w-20 bg-transparent text-end text-sm"
                          disabled={isLocked}
                        />
                        <span className="text-sm font-mono text-foreground">
                          %
                        </span>
                      </div>
                    </div>
                    <Slider
                      value={[customPercentages[key]]}
                      onValueChange={([value]) =>
                        handleMacroValueChange(key, value || 0)
                      }
                      min={min}
                      max={max}
                      step={1}
                      className="cursor-pointer"
                      disabled={isLocked}
                      aria-label={macroLabel}
                    />
                  </div>
                );
              })}

              <p className="mt-2 text-xs text-muted-foreground">
                {t('onboarding.dietApproachAdjustmentHint')}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
