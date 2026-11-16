import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  COOKED_WEIGHT_DECIMALS,
  cookedYieldFactor,
  rawQuantityFromCooked,
  roundYieldFactor,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NumericInput } from '@/components/NumericInput';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useLastCookedFoodEntry } from '@/hooks/Diary/useFoodEntries';

/** What the section hands back: the entry's raw and cooked quantity. */
export interface CookedWeightResult {
  rawQuantity: number;
  cookedQuantity: number;
}

interface CookedWeightSectionProps {
  /** Unit of the entry; the caller only renders this for weight units. */
  unit: string;
  foodName: string;
  /** The entry being edited, when it was weighed cooked. */
  editingEntry?: { quantity: number; cookedQuantity: number } | null;
  /**
   * Food to look up the person's last cooked entry for, to pre-fill the
   * yield. Leave it out when editing an entry.
   */
  previousFoodId?: string;
  /** Calories of a raw quantity, for the result line. */
  caloriesFor: (rawQuantity: number) => number | null;
  /**
   * Called with the switch state and, when the inputs are complete, the raw
   * and cooked quantity. An incomplete form reports `null` while switched on.
   */
  onChange: (enabled: boolean, result: CookedWeightResult | null) => void;
}

type YieldSource = 'previous' | 'entry' | 'batch';

/**
 * "Weighed it cooked" (#3534). The person enters the raw and cooked weight of
 * the batch and the cooked weight they ate; the entry stores the raw weight
 * as its quantity and the cooked weight eaten as `cooked_quantity`. A yield
 * from the last cooked entry (or the entry being edited) is reused until the
 * person starts a new batch.
 */
export const CookedWeightSection = ({
  unit,
  foodName,
  editingEntry,
  previousFoodId,
  caloriesFor,
  onChange,
}: CookedWeightSectionProps) => {
  const { t } = useTranslation();
  const { formatDate, energyUnit, convertEnergy, getEnergyUnitString } =
    usePreferences();

  const { data: previousEntry } = useLastCookedFoodEntry(
    previousFoodId,
    !!previousFoodId && !editingEntry
  );

  const editingYield = editingEntry
    ? cookedYieldFactor(editingEntry.quantity, editingEntry.cookedQuantity)
    : null;
  const previousYield = previousEntry
    ? cookedYieldFactor(previousEntry.quantity, previousEntry.cooked_quantity)
    : null;
  const initialSource: YieldSource =
    editingYield !== null
      ? 'entry'
      : previousYield !== null
        ? 'previous'
        : 'batch';

  const [enabled, setEnabled] = useState(initialSource !== 'batch');
  const [source, setSource] = useState<YieldSource>(initialSource);
  const [rawBatch, setRawBatch] = useState<number | undefined>(undefined);
  const [cookedBatch, setCookedBatch] = useState<number | undefined>(undefined);
  const [eaten, setEaten] = useState<number | undefined>(
    editingEntry?.cookedQuantity
  );

  // The last cooked entry arrives after the dialog opens. Pre-tick the switch
  // once it does, unless the person has already touched the section.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || editingYield !== null || previousYield === null) return;
    setEnabled(true);
    setSource('previous');
  }, [touched, editingYield, previousYield]);

  const reusedYield =
    source === 'entry'
      ? editingYield
      : source === 'previous'
        ? previousYield
        : null;
  const yieldFactor =
    source === 'batch' ? cookedYieldFactor(rawBatch, cookedBatch) : reusedYield;
  // Reopening an entry keeps its stored raw quantity until an amount changes,
  // so an untouched save does not round it.
  const rawQuantity =
    source === 'entry' && editingEntry && eaten === editingEntry.cookedQuantity
      ? editingEntry.quantity
      : rawQuantityFromCooked(eaten, yieldFactor);

  useEffect(() => {
    onChange(
      enabled,
      enabled && rawQuantity !== null && eaten !== undefined
        ? { rawQuantity, cookedQuantity: eaten }
        : null
    );
    // onChange is a fresh closure on every parent render; the values are the
    // only inputs that matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rawQuantity, eaten]);

  const calories = rawQuantity !== null ? caloriesFor(rawQuantity) : null;
  const formattedYield =
    yieldFactor !== null ? String(roundYieldFactor(yieldFactor)) : null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="cooked-weight-switch">
          {t('foodUnitSelector.cooked.switch', 'Weighed it cooked')}
        </Label>
        <Switch
          id="cooked-weight-switch"
          checked={enabled}
          onCheckedChange={(checked) => {
            setTouched(true);
            setEnabled(checked);
          }}
        />
      </div>

      {enabled && (
        <>
          {source !== 'batch' && formattedYield !== null ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {source === 'previous' && previousEntry
                  ? t(
                      'foodUnitSelector.cooked.usingPrevious',
                      'Using {{factor}}× from your {{food}} on {{date}}',
                      {
                        factor: formattedYield,
                        food: foodName,
                        date: formatDate(previousEntry.entry_date),
                      }
                    )
                  : t(
                      'foodUnitSelector.cooked.usingEntry',
                      'Using {{factor}}× from this entry',
                      { factor: formattedYield }
                    )}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTouched(true);
                  setSource('batch');
                }}
              >
                {t('foodUnitSelector.cooked.newBatch', 'New batch')}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cooked-raw-batch">
                  {t(
                    'foodUnitSelector.cooked.rawBatch',
                    'Raw weight of batch ({{unit}})',
                    { unit }
                  )}
                </Label>
                <NumericInput
                  id="cooked-raw-batch"
                  allowExpressions
                  step="any"
                  min="0.01"
                  decimals={COOKED_WEIGHT_DECIMALS}
                  value={rawBatch}
                  onValueChange={(value) => {
                    setTouched(true);
                    setRawBatch(value);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="cooked-cooked-batch">
                  {t(
                    'foodUnitSelector.cooked.cookedBatch',
                    'Cooked weight of batch ({{unit}})',
                    { unit }
                  )}
                </Label>
                <NumericInput
                  id="cooked-cooked-batch"
                  allowExpressions
                  step="any"
                  min="0.01"
                  decimals={COOKED_WEIGHT_DECIMALS}
                  value={cookedBatch}
                  onValueChange={(value) => {
                    setTouched(true);
                    setCookedBatch(value);
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="cooked-eaten">
              {t(
                'foodUnitSelector.cooked.eaten',
                'You ate (cooked, {{unit}})',
                { unit }
              )}
            </Label>
            <NumericInput
              id="cooked-eaten"
              allowExpressions
              step="any"
              min="0.01"
              decimals={COOKED_WEIGHT_DECIMALS}
              value={eaten}
              onValueChange={(value) => {
                setTouched(true);
                setEaten(value);
              }}
            />
          </div>

          <p role="status" className="text-sm">
            {rawQuantity !== null
              ? t(
                  'foodUnitSelector.cooked.result',
                  '= {{raw}} {{unit}} raw · {{calories}} {{energyUnit}}',
                  {
                    raw: rawQuantity,
                    unit,
                    calories:
                      calories !== null
                        ? Math.round(
                            convertEnergy(calories, 'kcal', energyUnit)
                          )
                        : '–',
                    energyUnit: getEnergyUnitString(energyUnit),
                  }
                )
              : source !== 'batch' && reusedYield !== null
                ? t(
                    'foodUnitSelector.cooked.enterEaten',
                    'Enter the cooked weight you ate.'
                  )
                : t(
                    'foodUnitSelector.cooked.incomplete',
                    'Enter the weights to calculate the raw amount.'
                  )}
          </p>
        </>
      )}
    </div>
  );
};
