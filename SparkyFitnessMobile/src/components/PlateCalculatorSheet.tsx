import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import {
  calculatePlateLoad,
  nextLoadableWeight,
  plateCalcInputFor,
  suggestBar,
  type PlateBar,
  type PlateUnit,
} from '@workspace/shared';
import { navigationRef } from './ActiveWorkoutBar';
import FocusPage, { FocusPageButton } from './FocusPage';
import Icon from './Icon';
import PlateBarDrawing from './PlateBarDrawing';
import { usePlateInventory } from '../hooks/usePlateInventory';
import { barLabel, formatPlateWeight } from '../utils/plateFormat';
import { plateUnitLabel } from '../utils/plateUnitLabel';
import { useCSSVariable } from 'uniwind';

interface PlateCalculatorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The set's weight in the person's weight unit, as shown; null if blank. */
  targetWeight: number | null;
  weightUnit: PlateUnit;
  equipment?: readonly string[] | null;
  /** Names the set under the target weight on the page. */
  exerciseName?: string;
  setNumber?: number;
  /**
   * Writes the adjusted target (in the person's weight unit) to the set the
   * page was opened for; the page then offers "Use … kg" when it differs.
   */
  onUseWeight?: (weight: number) => void;
}

/**
 * The plate calculator: a bottom sheet (`FocusPage variant="sheet"`, as the
 * workout menu) with the shared coloured bar drawing, bar chips and
 * loadable-weight stepping. Every
 * entry point (the focus plate strip, the set menu, the workout form) opens this
 * one design.
 */
export default function PlateCalculatorSheet({
  visible,
  onClose,
  targetWeight,
  weightUnit,
  equipment,
  exerciseName,
  setNumber,
  onUseWeight,
}: PlateCalculatorSheetProps) {
  const { t } = useTranslation();
  const { inventory, isLoading: inventoryLoading } =
    usePlateInventory(weightUnit);
  // The page's − / + move the target to the next loadable weight. A step is
  // only valid for the target and the plates it was worked out from, so a new
  // target or a changed inventory (the saved one arriving) drops it.
  const [adjustedWeight, setAdjustedWeight] = useState<number | null>(null);
  const [adjustedFrom, setAdjustedFrom] = useState({ targetWeight, inventory });
  if (
    adjustedFrom.targetWeight !== targetWeight ||
    adjustedFrom.inventory !== inventory
  ) {
    setAdjustedFrom({ targetWeight, inventory });
    setAdjustedWeight(null);
  }
  const shownTarget = adjustedWeight ?? targetWeight;
  const [chosenBarId, setChosenBarId] = useState<string | null>(null);
  const bar: PlateBar | null =
    inventory.bars.find((b) => b.id === chosenBarId) ??
    suggestBar(equipment, inventory.bars);

  const result = useMemo(() => {
    if (!bar || shownTarget == null) return null;
    return calculatePlateLoad(
      plateCalcInputFor(inventory, bar, shownTarget, weightUnit)
    );
  }, [inventory, bar, shownTarget, weightUnit]);

  const stepTo = (direction: 'up' | 'down') => {
    // Until the saved inventory has loaded the plates are the standard preset,
    // not necessarily the ones owned, so no other weight is offered yet.
    if (inventoryLoading || !bar || shownTarget == null) return null;
    return nextLoadableWeight(
      plateCalcInputFor(inventory, bar, shownTarget, weightUnit),
      direction
    );
  };
  const lighter = stepTo('down');
  const heavier = stepTo('up');

  const unit = inventory.unit;
  // Exact when loadable; otherwise the nearest loadable weight, never rounded
  // silently: the text below says it is not the target.
  const shown =
    result?.status === 'exact'
      ? result.load
      : (result?.below ?? result?.above ?? null);
  const unitLabel = plateUnitLabel(t, unit);
  // The target and the weights stepped to are in the person's weight unit,
  // which can differ from the inventory's.
  const targetUnitLabel = plateUnitLabel(t, weightUnit);
  const handleManage = () => {
    onClose();
    if (navigationRef?.isReady?.()) navigationRef.navigate('PlateInventory');
  };

  const eyebrow =
    'text-[13px] font-extrabold uppercase tracking-wider text-text-secondary';
  const perSide =
    result?.status === 'exact' && result.load
      ? result.load.plates
          .flatMap((plate) =>
            Array.from({ length: plate.count }, () =>
              formatPlateWeight(plate.weight)
            )
          )
          .join(' + ')
      : null;
  return (
    <FocusPage
      visible={visible}
      onClose={onClose}
      variant="sheet"
      title={t('plates.calculatorTitle', {
        defaultValue: 'Plate calculator',
      })}
      footer={
        onUseWeight != null && shownTarget != null ? (
          <FocusPageButton
            testID="plate-use-weight"
            variant="primary"
            label={t('plates.useWeight', {
              defaultValue: 'Use {{weight}} {{unit}}',
              weight: formatPlateWeight(shownTarget),
              unit: targetUnitLabel,
            })}
            onPress={() => onUseWeight(shownTarget)}
          />
        ) : undefined
      }
    >
      <View>
        <Text className={eyebrow}>
          {[
            t('plates.targetWeightLabel', { defaultValue: 'Target weight' }),
            exerciseName,
            exerciseName != null && setNumber != null
              ? t('plates.setNumber', {
                  defaultValue: 'set {{number}}',
                  number: setNumber,
                })
              : null,
          ]
            .filter((part) => part != null)
            .join(' · ')}
        </Text>
        {shownTarget != null ? (
          <View className="flex-row items-center justify-between">
            <Text
              testID="plate-target-weight"
              className="text-[44px] font-extrabold leading-[50px] text-text-primary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {`${formatPlateWeight(shownTarget)} ${targetUnitLabel}`}
            </Text>
            <View className="flex-row gap-2.5">
              <StepButton
                label={t('plates.lighter', {
                  defaultValue: 'Previous weight',
                })}
                icon="remove"
                disabled={lighter == null}
                onPress={() => lighter != null && setAdjustedWeight(lighter)}
              />
              <StepButton
                label={t('plates.heavier', {
                  defaultValue: 'Next weight',
                })}
                icon="add"
                disabled={heavier == null}
                onPress={() => heavier != null && setAdjustedWeight(heavier)}
              />
            </View>
          </View>
        ) : (
          <Text className="text-[17px] text-text-secondary">
            {t('plates.enterWeight', {
              defaultValue: 'Enter a weight for the set first.',
            })}
          </Text>
        )}
      </View>

      {shown && bar && (
        <View className="rounded-3xl bg-surface px-2 pb-3 pt-3.5">
          <Text className={`mb-1 text-center ${eyebrow}`}>
            {t('plates.oneSide', { defaultValue: 'One side of the bar' })}
          </Text>
          <PlateBarDrawing
            testID="plate-calculator-drawing"
            load={shown}
            unit={unit}
          />
          {perSide != null && result?.status === 'exact' && result.load && (
            <Text className="mt-1 text-center text-[17px] font-bold text-text-primary">
              {t('plates.perSideSummary', {
                defaultValue: '{{plates}} · {{weight}} {{unit}} per side',
                plates: perSide === '' ? '0' : perSide,
                weight: formatPlateWeight(result.load.perSideWeight),
                unit: unitLabel,
              })}
            </Text>
          )}
        </View>
      )}

      {bar && inventory.bars.length > 1 && (
        <View
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-2"
        >
          {inventory.bars.map((option) => {
            const selected = option.id === bar.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => setChosenBarId(option.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className={`h-9 justify-center rounded-full px-3 active:opacity-70 ${selected ? 'bg-accent-primary' : 'bg-control'}`}
              >
                <Text
                  className={`text-[14px] font-bold ${selected ? 'text-white' : 'text-text-primary'}`}
                >
                  {`${barLabel(t, option)} ${formatPlateWeight(option.weight)} ${unitLabel}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {result?.status === 'exact' && result.load && bar && (
        <Text className="text-[13px] text-text-secondary">
          {`${t('plates.sheetBreakdown', {
            defaultValue:
              '{{bar}} {{unit}} bar + {{plates}} {{unit}} of plates.',
            bar: formatPlateWeight(bar.weight),
            plates: formatPlateWeight(result.load.perSideWeight * 2),
            unit: unitLabel,
          })}${
            result.collarsWeight > 0
              ? ` ${t('plates.collarsWeight', {
                  defaultValue: 'collars {{weight}} {{unit}}',
                  weight: formatPlateWeight(result.collarsWeight),
                  unit: unitLabel,
                })}.`
              : ''
          } ${t('plates.barsHint', {
            defaultValue: 'Bars come from your equipment list.',
          })}`}
        </Text>
      )}

      {result?.status === 'exact' && (lighter != null || heavier != null) && (
        <View className="gap-1.5">
          <Text className={eyebrow}>
            {t('plates.nearbyWeights', {
              defaultValue: 'Nearby weights you can load',
            })}
          </Text>
          <View className="flex-row gap-2.5">
            {lighter != null && (
              <NearbyButton
                label={`${formatPlateWeight(lighter)} ${targetUnitLabel}`}
                direction="lighter"
                accessibilityLabel={t('plates.lighterWeight', {
                  defaultValue: 'Lighter: {{weight}} {{unit}}',
                  weight: formatPlateWeight(lighter),
                  unit: targetUnitLabel,
                })}
                onPress={() => setAdjustedWeight(lighter)}
              />
            )}
            {heavier != null && (
              <NearbyButton
                label={`${formatPlateWeight(heavier)} ${targetUnitLabel}`}
                direction="heavier"
                accessibilityLabel={t('plates.heavierWeight', {
                  defaultValue: 'Heavier: {{weight}} {{unit}}',
                  weight: formatPlateWeight(heavier),
                  unit: targetUnitLabel,
                })}
                onPress={() => setAdjustedWeight(heavier)}
              />
            )}
          </View>
        </View>
      )}

      {result?.status === 'inexact' && (
        <View className="gap-1.5 rounded-3xl bg-surface p-4">
          <Text className={eyebrow}>
            {t('plates.cantBeMade', {
              defaultValue: "When the weight can't be made",
            })}
          </Text>
          <Text className="text-[15px] text-text-primary">
            {result.below
              ? `${t('plates.nearestBelow', {
                  defaultValue: 'Nearest below: {{weight}} {{unit}}',
                  weight: formatPlateWeight(result.below.totalWeight),
                  unit: unitLabel,
                })} · ${t('plates.shortBy', {
                  defaultValue: '{{diff}} {{unit}} short of the target',
                  diff: formatPlateWeight(result.shortBy ?? 0),
                  unit: unitLabel,
                })}`
              : t('plates.nothingBelow', {
                  defaultValue:
                    'The target is lighter than the empty bar, collars included.',
                })}
          </Text>
          <Text className="text-[15px] text-text-primary">
            {result.above
              ? `${t('plates.nearestAbove', {
                  defaultValue: 'Nearest above: {{weight}} {{unit}}',
                  weight: formatPlateWeight(result.above.totalWeight),
                  unit: unitLabel,
                })} · ${t('plates.overBy', {
                  defaultValue: '{{diff}} {{unit}} over the target',
                  diff: formatPlateWeight(result.overBy ?? 0),
                  unit: unitLabel,
                })}`
              : t('plates.nothingAbove', {
                  defaultValue:
                    'The target is heavier than your plates can load.',
                })}
          </Text>
        </View>
      )}

      {result?.status === 'too_large' && (
        <Text className="text-[15px] text-text-danger-subtle">
          {t('plates.tooLarge', {
            defaultValue:
              'This inventory is too large to search. Remove some plates or pairs.',
          })}
        </Text>
      )}

      <Pressable
        onPress={handleManage}
        accessibilityRole="link"
        className="self-start py-1 active:opacity-70"
      >
        <Text className="text-[16px] font-bold text-accent-primary">
          {t('plates.editInventory', {
            defaultValue: 'Edit plate inventory',
          })}
        </Text>
      </Pressable>
    </FocusPage>
  );
}

function StepButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'add' | 'remove';
  disabled: boolean;
  onPress: () => void;
}) {
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={`h-11 w-11 items-center justify-center rounded-full bg-control active:opacity-70 ${disabled ? 'opacity-40' : ''}`}
    >
      <Icon name={icon} size={22} color={textPrimary} />
    </Pressable>
  );
}

/** A loadable weight with a chevron saying which way it moves from the target. */
function NearbyButton({
  label,
  direction,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  direction: 'lighter' | 'heavier';
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  const icon = (
    <Icon
      name={direction === 'lighter' ? 'chevron-back' : 'chevron-forward'}
      size={16}
      color={textPrimary}
      weight="bold"
    />
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-control active:opacity-70"
    >
      {direction === 'lighter' && icon}
      <Text className="text-[17px] font-bold text-text-primary">{label}</Text>
      {direction === 'heavier' && icon}
    </Pressable>
  );
}
