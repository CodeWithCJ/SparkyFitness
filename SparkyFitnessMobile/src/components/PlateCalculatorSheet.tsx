import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import PlateBarPicker from './PlateBarPicker';
import { PlateSide } from './PlateBarGraphic';
import { usePlateInventory } from '../hooks/usePlateInventory';
import { barLabel, formatPlateWeight } from '../utils/plateFormat';
import { plateColorKey, standardPlateWeights } from '../utils/plateColors';
import { plateUnitLabel } from '../utils/plateUnitLabel';
import { useCSSVariable } from 'uniwind';

interface PlateCalculatorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The set's weight in the person's weight unit, as shown; null if blank. */
  targetWeight: number | null;
  weightUnit: PlateUnit;
  equipment?: readonly string[] | null;
  /**
   * The focus view's full-screen Plate calculator page (Phone-Plate board)
   * instead of the bottom sheet; the maths is the same.
   */
  page?: boolean;
  /** Names the set under the target weight on the page. */
  exerciseName?: string;
  setNumber?: number;
  /**
   * Writes the adjusted target (in the person's weight unit) to the set the
   * page was opened for; the page then offers "Use … kg" when it differs.
   */
  onUseWeight?: (weight: number) => void;
}

/** A bottom sheet: the bar drawn with the plates for each side, and what is owned. */
export default function PlateCalculatorSheet({
  visible,
  onClose,
  targetWeight,
  weightUnit,
  equipment,
  page = false,
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
  const shownTarget = page ? (adjustedWeight ?? targetWeight) : targetWeight;
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
  const changed =
    shownTarget != null &&
    targetWeight != null &&
    Math.abs(shownTarget - targetWeight) > 1e-6;

  const unit = inventory.unit;
  // Exact when loadable; otherwise the nearest loadable weight, never rounded
  // silently: the text below says it is not the target.
  const shown =
    result?.status === 'exact'
      ? result.load
      : (result?.below ?? result?.above ?? null);
  const ownedPlates = inventory.plates.filter((plate) => plate.pairs > 0);
  const unitLabel = plateUnitLabel(t, unit);
  // The target and the weights stepped to are in the person's weight unit,
  // which can differ from the inventory's.
  const targetUnitLabel = plateUnitLabel(t, weightUnit);
  const [red, blue, yellow, green, white, grey] = useCSSVariable([
    '--color-plate-red',
    '--color-plate-blue',
    '--color-plate-yellow',
    '--color-plate-green',
    '--color-plate-white',
    '--color-plate-grey',
  ]) as string[];
  const plateColors = { red, blue, yellow, green, white, grey };

  const insets = useSafeAreaInsets();
  const handleManage = () => {
    onClose();
    if (navigationRef?.isReady?.()) navigationRef.navigate('PlateInventory');
  };

  if (page) {
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
        title={t('plates.calculatorTitle', {
          defaultValue: 'Plate calculator',
        })}
        footer={
          <View className="gap-2">
            {onUseWeight != null && shownTarget != null && changed ? (
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
            ) : (
              <FocusPageButton
                variant="primary"
                label={t('common.done', { defaultValue: 'Done' })}
                onPress={onClose}
              />
            )}
            <FocusPageButton
              variant="neutral"
              label={t('plates.editInventory', {
                defaultValue: 'Edit plate inventory',
              })}
              onPress={handleManage}
            />
          </View>
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
          {shownTarget != null && (
            <Text className="mt-0.5 text-[13px] text-text-secondary">
              {t('plates.stepHint', {
                defaultValue:
                  '− / + step to the next weight your plates can make',
              })}
            </Text>
          )}
        </View>

        {bar && (
          <PlateBarPicker
            bars={inventory.bars}
            selectedId={bar.id}
            suggestedId={suggestBar(equipment, inventory.bars)?.id ?? null}
            unit={unit}
            onSelect={setChosenBarId}
          />
        )}
        <Text className="-mt-2 text-[13px] text-text-secondary">
          {t('plates.barsHint', {
            defaultValue: 'Bars come from your equipment list.',
          })}
        </Text>

        {shown && bar && (
          <View className="rounded-3xl bg-surface px-2 pb-3 pt-3.5">
            <PlateBarDrawing
              testID="plate-calculator-drawing"
              load={shown}
              unit={unit}
            />
            {perSide != null && (
              <Text className="mt-1 text-center text-[19px] font-bold text-text-primary">
                {t('plates.perSideSummary', {
                  defaultValue: '{{plates}} per side',
                  plates: perSide === '' ? '0' : perSide,
                })}
              </Text>
            )}
            {result?.status === 'exact' && result.load && (
              <Text className="text-center text-[15px] text-text-secondary">
                {`${t('plates.pageBreakdown', {
                  defaultValue:
                    'bar {{bar}} {{unit}} · {{plates}} {{unit}} of plates',
                  bar: formatPlateWeight(bar.weight),
                  plates: formatPlateWeight(result.load.perSideWeight * 2),
                  unit: unitLabel,
                })}${
                  result.collarsWeight > 0
                    ? ` · ${t('plates.collarsWeight', {
                        defaultValue: 'collars {{weight}} {{unit}}',
                        weight: formatPlateWeight(result.collarsWeight),
                        unit: unitLabel,
                      })}`
                    : ''
                }`}
              </Text>
            )}
          </View>
        )}

        {result?.status === 'exact' && (lighter != null || heavier != null) && (
          <View className="gap-1.5 rounded-3xl bg-surface p-4">
            <Text className={eyebrow}>
              {t('plates.nearbyWeights', {
                defaultValue: 'Nearby weights you can load',
              })}
            </Text>
            <Text className="text-[15px] text-text-secondary">
              {[
                lighter != null
                  ? `− ${formatPlateWeight(lighter)} ${targetUnitLabel}`
                  : null,
                heavier != null
                  ? `+ ${formatPlateWeight(heavier)} ${targetUnitLabel}`
                  : null,
              ]
                .filter((part) => part != null)
                .join(' · ')}
            </Text>
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

        <View className="gap-1.5 rounded-3xl bg-surface p-4">
          <Text className={eyebrow}>
            {t('plates.platesYouOwn', { defaultValue: 'Plates you own' })}
          </Text>
          <Text className="text-[18px] font-extrabold text-text-primary">
            {`${ownedPlates.map((plate) => formatPlateWeight(plate.weight)).join(' · ')} ${unitLabel}`}
          </Text>
          <View className="mt-1 flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
            {standardPlateWeights(unit).map((weight) => (
              <View key={weight} className="flex-row items-center gap-1">
                <View
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{
                    backgroundColor: plateColors[plateColorKey(weight, unit)],
                  }}
                />
                <Text className="text-[13px] text-text-secondary">
                  {formatPlateWeight(weight)}
                </Text>
              </View>
            ))}
            <Text className="text-[13px] text-text-secondary">
              {t('plates.othersGrey', { defaultValue: 'others grey' })}
            </Text>
          </View>
        </View>
      </FocusPage>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end"
        // The sheet sits inside the safe area: beside the Duo's vertical bar
        // the side inset is the strip, and a full-width sheet runs under it.
        style={{
          backgroundColor: 'rgba(0,0,0,0.5)',
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingTop: insets.top,
        }}
        onPress={onClose}
        accessibilityLabel={t('plates.dismiss', {
          defaultValue: 'Close plate calculator',
        })}
      >
        <Pressable
          className="bg-surface px-5 pt-3 pb-8"
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
          }}
          onPress={() => {}}
          accessible={false}
        >
          <View
            className="self-center rounded-full bg-text-muted mb-3"
            style={{ width: 40, height: 4, opacity: 0.5 }}
          />
          <Text className="text-lg font-semibold text-text-primary text-center">
            {t('plates.calculatorTitle', { defaultValue: 'Plate calculator' })}
          </Text>
          <Text className="text-base text-text-muted text-center mb-2">
            {targetWeight != null
              ? t('plates.targetWeight', {
                  defaultValue: 'Target weight: {{weight}} {{unit}}',
                  weight: formatPlateWeight(targetWeight),
                  unit: weightUnit,
                })
              : t('plates.enterWeight', {
                  defaultValue: 'Enter a weight for the set first.',
                })}
          </Text>

          <ScrollView>
            {shown && bar && (
              <View
                className="items-center justify-center"
                style={{ minHeight: 120 }}
                accessible
                accessibilityLabel={t('plates.graphicLabel', {
                  defaultValue:
                    '{{perSide}} {{unit}} per side on a {{bar}} {{unit}} bar',
                  perSide: formatPlateWeight(shown.perSideWeight),
                  bar: formatPlateWeight(bar.weight),
                  unit,
                })}
              >
                <View style={{ transform: [{ scale: 1.5 }] }}>
                  <PlateSide load={shown} barWeight={bar.weight} />
                </View>
              </View>
            )}

            {result?.status === 'exact' && result.load && (
              <Text className="text-sm text-text-muted text-center">
                {t('plates.loadSummary', {
                  defaultValue:
                    '{{perSide}} {{unit}} per side · {{total}} {{unit}} total',
                  perSide: formatPlateWeight(result.load.perSideWeight),
                  total: formatPlateWeight(result.load.totalWeight),
                  unit,
                })}
                {result.collarsWeight > 0
                  ? ` · ${t('plates.collarsWeight', {
                      defaultValue: 'collars {{weight}} {{unit}}',
                      weight: formatPlateWeight(result.collarsWeight),
                      unit,
                    })}`
                  : ''}
              </Text>
            )}

            {result?.status === 'inexact' && (
              <View>
                <Text className="text-base text-red-500 text-center">
                  {t('plates.cannotLoad', {
                    defaultValue:
                      'Your plates cannot make exactly {{weight}} {{unit}}.',
                    weight: formatPlateWeight(result.target),
                    unit,
                  })}
                </Text>
                {result.below ? (
                  <Text className="text-sm text-text-primary text-center mt-1">
                    {t('plates.nearestBelow', {
                      defaultValue: 'Nearest below: {{weight}} {{unit}}',
                      weight: formatPlateWeight(result.below.totalWeight),
                      unit,
                    })}
                    {` · ${t('plates.shortBy', {
                      defaultValue: '{{diff}} {{unit}} short of the target',
                      diff: formatPlateWeight(result.shortBy ?? 0),
                      unit,
                    })}`}
                  </Text>
                ) : (
                  <Text className="text-sm text-text-muted text-center mt-1">
                    {t('plates.nothingBelow', {
                      defaultValue:
                        'The target is lighter than the empty bar, collars included.',
                    })}
                  </Text>
                )}
                {result.above ? (
                  <Text className="text-sm text-text-primary text-center">
                    {t('plates.nearestAbove', {
                      defaultValue: 'Nearest above: {{weight}} {{unit}}',
                      weight: formatPlateWeight(result.above.totalWeight),
                      unit,
                    })}
                    {` · ${t('plates.overBy', {
                      defaultValue: '{{diff}} {{unit}} over the target',
                      diff: formatPlateWeight(result.overBy ?? 0),
                      unit,
                    })}`}
                  </Text>
                ) : (
                  <Text className="text-sm text-text-muted text-center">
                    {t('plates.nothingAbove', {
                      defaultValue:
                        'The target is heavier than your plates can load.',
                    })}
                  </Text>
                )}
              </View>
            )}

            {result?.status === 'too_large' && (
              <Text className="text-sm text-red-500 text-center">
                {t('plates.tooLarge', {
                  defaultValue:
                    'This inventory is too large to search. Remove some plates or pairs.',
                })}
              </Text>
            )}

            <View className="flex-row items-center justify-between mt-6 mb-3">
              <Text className="text-base text-text-muted">
                {t('plates.availableEquipment', {
                  defaultValue: 'Available equipment',
                })}
              </Text>
              <Pressable
                onPress={handleManage}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text className="text-base font-semibold text-accent-primary">
                  {t('plates.manage', { defaultValue: 'Manage' })}
                </Text>
              </Pressable>
            </View>

            <View className="flex-row items-center mb-3">
              <Text
                className="text-base text-text-primary"
                style={{ width: 90 }}
              >
                {t('plates.platesUnit', {
                  defaultValue: 'Plates ({{unit}})',
                  unit,
                })}
              </Text>
              <View className="flex-1 flex-row flex-wrap gap-2">
                {ownedPlates.map((plate) => (
                  <View
                    key={plate.weight}
                    className="rounded-full bg-accent-primary items-center justify-center"
                    style={{ minWidth: 44, height: 44, paddingHorizontal: 8 }}
                  >
                    <Text className="text-white font-semibold">
                      {formatPlateWeight(plate.weight)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="flex-row items-center">
              <Text
                className="text-base text-text-primary"
                style={{ width: 90 }}
              >
                {t('plates.barUnit', { defaultValue: 'Bar ({{unit}})', unit })}
              </Text>
              <View className="flex-1 flex-row flex-wrap gap-2">
                {inventory.bars.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => setChosenBarId(b.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: b.id === bar?.id }}
                    className={`rounded-full px-4 py-2 ${
                      b.id === bar?.id ? 'bg-accent-primary' : 'bg-raised'
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        b.id === bar?.id
                          ? 'text-white font-semibold'
                          : 'text-text-primary'
                      }`}
                    >
                      {barLabel(t, b)} ({formatPlateWeight(b.weight)} {unit})
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
