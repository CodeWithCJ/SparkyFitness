import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  calculatePlateLoad,
  convertPlateWeight,
  getPrecision,
  inventoryConfigFrom,
  plateCalcInputFor,
  suggestBar,
  type PlateBar,
  type PlateLoad,
  type PlateUnit,
} from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePlateInventory } from '@/hooks/PlateInventory/usePlateInventory';
import type { WeightUnit } from '@/contexts/PreferencesContext';
import { kgToLbs } from '@/utils/unitConversions';
import { barLabel, formatPlateWeight } from './plateFormat';

interface PlateCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The set's weight in kilograms, as stored; null when none is typed. */
  weightKg: number | null | undefined;
  weightUnit: WeightUnit;
  equipment?: string[] | null;
}

/** Plates are measured in kg or lb; stones show as pounds. */
const plateUnitFor = (unit: WeightUnit): PlateUnit =>
  unit === 'kg' ? 'kg' : 'lbs';

const PlateLoadView: React.FC<{
  load: PlateLoad;
  unit: PlateUnit;
}> = ({ load, unit }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      {load.plates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('plates.noPlates', 'No plates, the bar alone.')}
        </p>
      ) : (
        <ul
          className="flex flex-wrap gap-2"
          aria-label={t('plates.perSide', 'Plates on each side')}
        >
          {load.plates.map((plate) => (
            <li
              key={plate.weight}
              className="rounded-md border bg-muted px-2 py-1 text-sm font-medium tabular-nums"
            >
              {plate.count} × {formatPlateWeight(plate.weight)} {unit}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground tabular-nums">
        {t(
          'plates.loadSummary',
          '{{perSide}} {{unit}} per side · {{total}} {{unit}} total',
          {
            perSide: formatPlateWeight(load.perSideWeight),
            total: formatPlateWeight(load.totalWeight),
            unit,
          }
        )}
      </p>
    </div>
  );
};

export const PlateCalculatorDialog: React.FC<PlateCalculatorDialogProps> = ({
  open,
  onOpenChange,
  weightKg,
  weightUnit,
  equipment,
}) => {
  const { t } = useTranslation();
  const { data: stored } = usePlateInventory();
  const targetUnit = plateUnitFor(weightUnit);
  const inventory = useMemo(
    () => inventoryConfigFrom(stored, targetUnit),
    [stored, targetUnit]
  );

  const [chosenBarId, setChosenBarId] = useState<string | null>(null);
  const bar: PlateBar | null =
    inventory.bars.find((b) => b.id === chosenBarId) ??
    suggestBar(equipment, inventory.bars);

  // The weight as the set row shows it, so the target is what the person
  // sees, not a longer decimal from the stored kilograms.
  const target = useMemo(() => {
    if (weightKg == null || !Number.isFinite(weightKg)) return null;
    const shown = targetUnit === 'kg' ? weightKg : kgToLbs(weightKg);
    return Number(shown.toFixed(getPrecision('weight', targetUnit)));
  }, [weightKg, targetUnit]);

  const result = useMemo(() => {
    if (!bar || target == null) return null;
    return calculatePlateLoad(
      plateCalcInputFor(inventory, bar, target, targetUnit)
    );
  }, [inventory, bar, target, targetUnit]);

  const unit = inventory.unit;
  const inTargetUnit = (value: number) =>
    formatPlateWeight(convertPlateWeight(value, unit, targetUnit));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('plates.calculatorTitle', 'Plate calculator')}
          </DialogTitle>
          <DialogDescription>
            {target != null
              ? t('plates.target', 'Target {{weight}} {{unit}}', {
                  weight: formatPlateWeight(target),
                  unit: targetUnit,
                })
              : t('plates.enterWeight', 'Enter a weight for the set first.')}
          </DialogDescription>
        </DialogHeader>

        {bar && target != null && result && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="plate-calc-bar">{t('plates.bar', 'Bar')}</Label>
              <Select value={bar.id} onValueChange={setChosenBarId}>
                <SelectTrigger id="plate-calc-bar">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {inventory.bars.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {barLabel(t, b)} · {formatPlateWeight(b.weight)} {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {result.status === 'invalid' && (
              <p role="status" className="text-sm text-muted-foreground">
                {t('plates.enterWeight', 'Enter a weight for the set first.')}
              </p>
            )}
            {result.status === 'too_large' && (
              <p role="alert" className="text-sm text-destructive">
                {t(
                  'plates.tooLarge',
                  'This inventory is too large to search. Remove some plates or pairs.'
                )}
              </p>
            )}

            {result.status === 'exact' && result.load && (
              <section className="space-y-2">
                <p className="text-sm tabular-nums">
                  {t('plates.barWeight', 'Bar {{weight}} {{unit}}', {
                    weight: formatPlateWeight(result.barWeight),
                    unit,
                  })}
                  {result.collarsWeight > 0 &&
                    ` · ${t(
                      'plates.collarsWeight',
                      'collars {{weight}} {{unit}}',
                      {
                        weight: formatPlateWeight(result.collarsWeight),
                        unit,
                      }
                    )}`}
                </p>
                <PlateLoadView load={result.load} unit={unit} />
                {unit !== targetUnit && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t('plates.convertedTotal', '= {{weight}} {{unit}}', {
                      weight: inTargetUnit(result.load.totalWeight),
                      unit: targetUnit,
                    })}
                  </p>
                )}
              </section>
            )}

            {result.status === 'inexact' && (
              <section className="space-y-3">
                <p role="status" className="text-sm font-medium">
                  {t(
                    'plates.cannotLoad',
                    'Your plates cannot make exactly {{weight}} {{unit}}.',
                    { weight: formatPlateWeight(result.target), unit }
                  )}
                </p>
                {result.below ? (
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">
                      {t(
                        'plates.nearestBelow',
                        'Nearest below: {{weight}} {{unit}}',
                        {
                          weight: formatPlateWeight(result.below.totalWeight),
                          unit,
                        }
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t(
                        'plates.shortBy',
                        '{{diff}} {{unit}} short of the target',
                        {
                          diff: formatPlateWeight(result.shortBy ?? 0),
                          unit,
                        }
                      )}
                    </p>
                    <PlateLoadView load={result.below} unit={unit} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      'plates.nothingBelow',
                      'The target is lighter than the empty bar, collars included.'
                    )}
                  </p>
                )}
                {result.above ? (
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">
                      {t(
                        'plates.nearestAbove',
                        'Nearest above: {{weight}} {{unit}}',
                        {
                          weight: formatPlateWeight(result.above.totalWeight),
                          unit,
                        }
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t('plates.overBy', '{{diff}} {{unit}} over the target', {
                        diff: formatPlateWeight(result.overBy ?? 0),
                        unit,
                      })}
                    </p>
                    <PlateLoadView load={result.above} unit={unit} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      'plates.nothingAbove',
                      'The target is heavier than your plates can load.'
                    )}
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
