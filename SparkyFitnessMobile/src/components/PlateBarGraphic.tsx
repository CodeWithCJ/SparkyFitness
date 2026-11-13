import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  calculatePlateLoad,
  plateCalcInputFor,
  suggestBar,
  type PlateLoad,
  type PlateUnit,
} from '@workspace/shared';
import { usePlateInventory } from '../hooks/usePlateInventory';
import { formatPlateWeight } from '../utils/plateFormat';

interface PlateBarGraphicProps {
  /** The set's weight in the person's weight unit, as shown. */
  targetWeight: number | null;
  weightUnit: PlateUnit;
  equipment?: readonly string[] | null;
}

const PLATE_HEIGHT_MIN = 16;
const PLATE_HEIGHT_MAX = 30;

/** One side of the bar: the bar stub, then the plates from heaviest outwards. */
export const PlateSide: React.FC<{ load: PlateLoad; barWeight: number }> = ({
  load,
  barWeight,
}) => {
  const heaviest = load.plates[0]?.weight ?? 1;
  return (
    <View className="flex-row items-center" accessible={false}>
      <View
        className="rounded-sm bg-text-muted items-center justify-center"
        style={{ height: 14, paddingHorizontal: 4 }}
      >
        <Text className="text-white" style={{ fontSize: 9 }}>
          {formatPlateWeight(barWeight)}
        </Text>
      </View>
      <View style={{ width: 4, height: 8 }} className="bg-text-muted" />
      {load.plates.flatMap((plate) =>
        Array.from({ length: plate.count }, (_, i) => (
          <View
            key={`${plate.weight}-${i}`}
            className="rounded-sm bg-accent-primary items-center justify-center mr-0.5"
            style={{
              height:
                PLATE_HEIGHT_MIN +
                (PLATE_HEIGHT_MAX - PLATE_HEIGHT_MIN) *
                  Math.min(1, plate.weight / heaviest),
              minWidth: 16,
              paddingHorizontal: 2,
            }}
          >
            <Text className="text-white font-semibold" style={{ fontSize: 10 }}>
              {formatPlateWeight(plate.weight)}
            </Text>
          </View>
        ))
      )}
      <View style={{ width: 4, height: 8 }} className="bg-text-muted" />
    </View>
  );
};

/**
 * The plate load for a set's weight on the person's own inventory, or null
 * until it is known (the standard preset is never passed off as theirs while
 * the first load settles or after it failed) and when no bar suits the
 * equipment.
 */
export function usePlateLoad(
  targetWeight: number | null,
  weightUnit: PlateUnit,
  equipment?: readonly string[] | null
) {
  const { inventory, hasSaved, isLoading, isError } =
    usePlateInventory(weightUnit);
  const bar = suggestBar(equipment, inventory.bars);

  const result = useMemo(() => {
    if (!bar || targetWeight == null || targetWeight <= 0) return null;
    return calculatePlateLoad(
      plateCalcInputFor(inventory, bar, targetWeight, weightUnit)
    );
  }, [inventory, bar, targetWeight, weightUnit]);

  if ((isLoading || isError) && !hasSaved) return null;
  if (!bar || !result) return null;
  return { result, unit: inventory.unit };
}

/**
 * The plates for one side of the bar, drawn in the exercise header like the
 * bar itself. Only an exactly loadable weight is drawn; anything else shows
 * the nearest loadable weight below it, marked as not exact, never rounded.
 */
export default function PlateBarGraphic({
  targetWeight,
  weightUnit,
  equipment,
}: PlateBarGraphicProps) {
  const { t } = useTranslation();
  const load = usePlateLoad(targetWeight, weightUnit, equipment);
  if (!load) return null;
  const { result, unit } = load;

  if (result.status === 'exact' && result.load) {
    return (
      <View
        accessible
        accessibilityLabel={t('plates.graphicLabel', {
          defaultValue:
            '{{perSide}} {{unit}} per side on a {{bar}} {{unit}} bar',
          perSide: formatPlateWeight(result.load.perSideWeight),
          bar: formatPlateWeight(result.barWeight),
          unit: unit,
        })}
      >
        <PlateSide load={result.load} barWeight={result.barWeight} />
      </View>
    );
  }

  if (result.status === 'inexact') {
    return (
      <Text
        className="text-sm text-text-muted"
        accessibilityLabel={t('plates.graphicNotExact', {
          defaultValue: 'Your plates cannot make exactly {{weight}} {{unit}}.',
          weight: formatPlateWeight(result.target),
          unit: unit,
        })}
      >
        {result.below
          ? t('plates.graphicNearest', {
              defaultValue: 'Plates: nearest {{weight}} {{unit}}',
              weight: formatPlateWeight(result.below.totalWeight),
              unit: unit,
            })
          : t('plates.graphicBelowBar', {
              defaultValue: 'Plates: lighter than the bar',
            })}
      </Text>
    );
  }
  return null;
}
