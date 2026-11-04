import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import {
  calculatePlateLoad,
  plateCalcInputFor,
  suggestBar,
  type PlateBar,
  type PlateUnit,
} from '@workspace/shared';
import { navigationRef } from './ActiveWorkoutBar';
import { PlateSide } from './PlateBarGraphic';
import { usePlateInventory } from '../hooks/usePlateInventory';
import { barLabel, formatPlateWeight } from '../utils/plateFormat';

interface PlateCalculatorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The set's weight in the person's weight unit, as shown; null if blank. */
  targetWeight: number | null;
  weightUnit: PlateUnit;
  equipment?: readonly string[] | null;
}

/** A bottom sheet: the bar drawn with the plates for each side, and what is owned. */
export default function PlateCalculatorSheet({
  visible,
  onClose,
  targetWeight,
  weightUnit,
  equipment,
}: PlateCalculatorSheetProps) {
  const { t } = useTranslation();
  const { inventory } = usePlateInventory(weightUnit);
  const [chosenBarId, setChosenBarId] = useState<string | null>(null);
  const bar: PlateBar | null =
    inventory.bars.find((b) => b.id === chosenBarId) ??
    suggestBar(equipment, inventory.bars);

  const result = useMemo(() => {
    if (!bar || targetWeight == null) return null;
    return calculatePlateLoad(
      plateCalcInputFor(inventory, bar, targetWeight, weightUnit)
    );
  }, [inventory, bar, targetWeight, weightUnit]);

  const unit = inventory.unit;
  // Exact when loadable; otherwise the nearest loadable weight, never rounded
  // silently: the text below says it is not the target.
  const shown =
    result?.status === 'exact'
      ? result.load
      : (result?.below ?? result?.above ?? null);
  const ownedPlates = inventory.plates.filter((plate) => plate.pairs > 0);

  const handleManage = () => {
    onClose();
    if (navigationRef?.isReady?.()) navigationRef.navigate('PlateInventory');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
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
