import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { PlateUnit } from '@workspace/shared';
import Icon from './Icon';
import PlateBarDrawing from './PlateBarDrawing';
import { usePlateLoad } from './PlateBarGraphic';
import { formatPlateWeight } from '../utils/plateFormat';
import { plateUnitLabel } from '../utils/plateUnitLabel';

interface Props {
  /** The set's weight in the person's weight unit, as shown. */
  targetWeight: number | null;
  weightUnit: PlateUnit;
  equipment?: readonly string[] | null;
  /** Opens the plate calculator sheet for the set. */
  onOpenCalculator: () => void;
}

/**
 * The focus view's plate strip: the bar drawn with this side's plates (the
 * calculator's drawing, small), one line naming them, and a button that opens the plate calculator. Only an
 * exactly loadable weight is drawn; anything else says so, never rounded.
 */
function FocusPlateStrip({
  targetWeight,
  weightUnit,
  equipment,
  onOpenCalculator,
}: Props) {
  const { t } = useTranslation();
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  const load = usePlateLoad(targetWeight, weightUnit, equipment);
  if (!load) return null;
  const { result, unit: plateUnit } = load;
  const unit = plateUnitLabel(t, plateUnit);

  let body: React.ReactNode;
  if (result.status === 'exact' && result.load) {
    const plates = result.load.plates
      .flatMap((plate) =>
        Array.from({ length: plate.count }, () =>
          formatPlateWeight(plate.weight)
        )
      )
      .join(' + ');
    body = (
      <>
        <PlateBarDrawing
          load={result.load}
          unit={plateUnit}
          variant="compact"
        />
        <Text className="min-w-0 flex-1 text-sm text-text-primary">
          {t('activeWorkout.focus.plates.perSide', {
            defaultValue: 'Per side:',
          })}{' '}
          <Text className="font-bold">{plates === '' ? '0' : plates}</Text>{' '}
          {t('activeWorkout.focus.plates.onBar', {
            defaultValue: 'on a {{bar}} {{unit}} bar',
            bar: formatPlateWeight(result.barWeight),
            unit,
          })}
        </Text>
      </>
    );
  } else if (result.status === 'inexact') {
    body = (
      <Text className="min-w-0 flex-1 text-sm text-text-secondary">
        {result.below
          ? t('plates.graphicNearest', {
              defaultValue: 'Plates: nearest {{weight}} {{unit}}',
              weight: formatPlateWeight(result.below.totalWeight),
              unit,
            })
          : t('plates.graphicBelowBar', {
              defaultValue: 'Plates: lighter than the bar',
            })}
      </Text>
    );
  } else {
    return null;
  }

  return (
    <View
      testID="focus-plate-strip"
      className="flex-row items-center gap-2.5 rounded-[20px] bg-raised py-2 pl-3 pr-2"
    >
      {body}
      <Pressable
        onPress={onOpenCalculator}
        accessibilityRole="button"
        accessibilityLabel={t('activeWorkout.focus.plates.calculator', {
          defaultValue: 'Plate calculator',
        })}
        className="h-11 w-11 items-center justify-center rounded-full bg-control active:opacity-70"
      >
        <Icon name="exercise-weights" size={22} color={textPrimary} />
      </Pressable>
    </View>
  );
}

export default React.memo(FocusPlateStrip);
