import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import {
  COOKED_WEIGHT_DECIMALS,
  cookedYieldFactor,
  rawQuantityFromCooked,
  roundCookedWeightForDisplay,
  type EnergyUnit,
  type LastCookedFoodEntry,
} from '@workspace/shared';
import Switch from './ui/Switch';
import { formatShortDate } from '../utils/dateUtils';
import { formatEnergy } from '../utils/energyUnit';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { formatLocalizedNumber } from '../localization';

/** What the section hands back: the entry's raw and cooked quantity. */
export interface CookedWeightResult {
  rawQuantity: number;
  cookedQuantity: number;
}

interface CookedWeightSectionProps {
  /** Unit of the entry; the caller only renders this for weight units. */
  unit: string;
  energyUnit: EnergyUnit;
  /** The entry being edited, when it was weighed cooked. */
  editingEntry?: { quantity: number; cookedQuantity: number } | null;
  /** The person's last cooked entry of this food, to pre-fill the yield. */
  previousEntry?: LastCookedFoodEntry | null;
  /** Calories (kcal) of a raw quantity, for the result line. */
  caloriesFor: (rawQuantity: number) => number | null;
  /**
   * Called with the switch state and, when the inputs are complete, the raw
   * and cooked quantity. An incomplete form reports `null` while switched on.
   */
  onChange: (enabled: boolean, result: CookedWeightResult | null) => void;
}

type YieldSource = 'previous' | 'entry' | 'batch';

const positiveOrUndefined = (text: string): number | undefined => {
  const value = parseDecimalInput(text);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

/**
 * "Weighed it cooked" (#3534). The person enters the raw and cooked weight of
 * the batch and the cooked weight they ate; the entry stores the raw weight
 * as its quantity and the cooked weight eaten as `cooked_quantity`. A yield
 * from the last cooked entry (or the entry being edited) is reused until the
 * person starts a new batch. Same rules and rounding as the web form, from
 * `@workspace/shared`.
 */
const CookedWeightSection: React.FC<CookedWeightSectionProps> = ({
  unit,
  energyUnit,
  editingEntry,
  previousEntry,
  caloriesFor,
  onChange,
}) => {
  const { t, i18n } = useTranslation();
  const [textSecondary] = useCSSVariable(['--color-text-secondary']) as [
    string,
  ];
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
  const [rawBatchText, setRawBatchText] = useState('');
  const [cookedBatchText, setCookedBatchText] = useState('');
  const [eatenText, setEatenText] = useState(
    editingEntry ? String(editingEntry.cookedQuantity) : ''
  );

  // The last cooked entry arrives after the screen opens. Pre-tick the switch
  // once it does, unless the person has already touched the section.
  const [touched, setTouched] = useState(false);
  const shouldPreTick =
    !touched && editingYield === null && previousYield !== null;
  const [wasPreTicked, setWasPreTicked] = useState(false);
  if (shouldPreTick && !wasPreTicked) {
    setWasPreTicked(true);
    setEnabled(true);
    setSource('previous');
  } else if (!shouldPreTick && wasPreTicked) {
    setWasPreTicked(false);
  }

  const eaten = positiveOrUndefined(eatenText);
  const reusedYield =
    source === 'entry'
      ? editingYield
      : source === 'previous'
        ? previousYield
        : null;
  const yieldFactor =
    source === 'batch'
      ? cookedYieldFactor(
          positiveOrUndefined(rawBatchText),
          positiveOrUndefined(cookedBatchText)
        )
      : reusedYield;
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

  const numberInput = (
    label: string,
    value: string,
    setValue: (text: string) => void
  ) => (
    <View className="flex-1">
      <Text className="text-text-secondary text-sm mb-1">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className="bg-raised border border-border-subtle rounded-lg px-3 py-2 text-text-primary text-base"
        keyboardType="decimal-pad"
        value={value}
        placeholderTextColor={textSecondary}
        onChangeText={(text) => {
          if (!DECIMAL_INPUT_REGEX.test(text)) return;
          setTouched(true);
          setValue(text);
        }}
      />
    </View>
  );

  const formatWeight = (value: number, weightUnit: string) =>
    formatLocalizedNumber(roundCookedWeightForDisplay(value, weightUnit), {
      maximumFractionDigits: COOKED_WEIGHT_DECIMALS,
    });
  // The reused batch in plain words: the raw and cooked weight it was logged
  // with, in that entry's own unit.
  const reusedBatch =
    source === 'entry' && editingEntry && editingYield !== null
      ? {
          raw: editingEntry.quantity,
          cooked: editingEntry.cookedQuantity,
          unit,
        }
      : source === 'previous' && previousEntry && previousYield !== null
        ? {
            raw: previousEntry.quantity,
            cooked: previousEntry.cooked_quantity,
            unit: previousEntry.unit ?? unit,
          }
        : null;
  const batchValues = reusedBatch
    ? {
        raw: formatWeight(reusedBatch.raw, reusedBatch.unit),
        cooked: formatWeight(reusedBatch.cooked, reusedBatch.unit),
        unit: reusedBatch.unit,
      }
    : null;
  const calories = rawQuantity !== null ? caloriesFor(rawQuantity) : null;
  const switchLabel = t('foodEntryAdd.cooked.switch', {
    defaultValue: 'Weighed it cooked',
  });

  return (
    <View className="mt-3 rounded-lg border border-border-subtle p-3 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-text-primary text-base">{switchLabel}</Text>
        <Switch
          accessibilityLabel={switchLabel}
          value={enabled}
          onValueChange={(next) => {
            setTouched(true);
            setEnabled(next);
          }}
        />
      </View>

      {enabled ? (
        <>
          {batchValues !== null ? (
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-text-secondary text-sm flex-1">
                {source === 'previous' && previousEntry
                  ? t('foodEntryAdd.cooked.sameBatchPrevious', {
                      defaultValue:
                        'Same batch as on {{date}}: {{raw}} {{unit}} raw → {{cooked}} {{unit}} cooked',
                      ...batchValues,
                      date: formatShortDate(
                        previousEntry.entry_date,
                        i18n.language
                      ),
                    })
                  : t('foodEntryAdd.cooked.sameBatchEntry', {
                      defaultValue:
                        'Same batch as this entry: {{raw}} {{unit}} raw → {{cooked}} {{unit}} cooked',
                      ...batchValues,
                    })}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  setTouched(true);
                  setSource('batch');
                }}
                className="border border-border-subtle rounded-lg px-3 py-1.5"
              >
                <Text className="text-text-primary text-sm font-medium">
                  {t('foodEntryAdd.cooked.newBatch', {
                    defaultValue: 'New batch',
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row gap-3">
              {numberInput(
                t('foodEntryAdd.cooked.rawBatch', {
                  defaultValue: 'Raw weight of batch ({{unit}})',
                  unit,
                }),
                rawBatchText,
                setRawBatchText
              )}
              {numberInput(
                t('foodEntryAdd.cooked.cookedBatch', {
                  defaultValue: 'Cooked weight of batch ({{unit}})',
                  unit,
                }),
                cookedBatchText,
                setCookedBatchText
              )}
            </View>
          )}

          {numberInput(
            t('foodEntryAdd.cooked.eaten', {
              defaultValue: 'You ate (cooked, {{unit}})',
              unit,
            }),
            eatenText,
            setEatenText
          )}

          <Text
            className="text-text-primary text-sm"
            accessibilityLiveRegion="polite"
          >
            {rawQuantity !== null
              ? t('foodEntryAdd.cooked.result', {
                  defaultValue: '= {{raw}} {{unit}} raw · {{energy}}',
                  raw: formatWeight(rawQuantity, unit),
                  unit,
                  energy:
                    calories !== null
                      ? formatEnergy(calories, energyUnit, t)
                      : '–',
                })
              : source !== 'batch' && reusedYield !== null
                ? t('foodEntryAdd.cooked.enterEaten', {
                    defaultValue: 'Enter the cooked weight you ate.',
                  })
                : t('foodEntryAdd.cooked.incomplete', {
                    defaultValue:
                      'Enter the weights to calculate the raw amount.',
                  })}
          </Text>
        </>
      ) : null}
    </View>
  );
};

export default CookedWeightSection;
