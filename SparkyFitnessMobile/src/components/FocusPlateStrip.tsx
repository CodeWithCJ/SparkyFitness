import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';
import type { PlateLoad, PlateUnit } from '@workspace/shared';
import PlateBarDrawing from './PlateBarDrawing';
import { usePlateLoad } from './PlateBarGraphic';
import { formatPlateWeight } from '../utils/plateFormat';
import { plateUnitLabel } from '../utils/plateUnitLabel';

// The strip's bar graphic is drawn at half the compact size (was 0.7): an
// 18 pt tall drawing next to 12 pt text, one line.
const PLATE_SCALE = 0.5;

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
 * calculator's drawing, small) and one "per side" line naming them; the whole line opens the plate calculator. A weight the plates
 * can't make draws the nearest one below it and says so, never rounding.
 */
function FocusPlateStrip({
  targetWeight,
  weightUnit,
  equipment,
  onOpenCalculator,
}: Props) {
  const { t } = useTranslation();
  const load = usePlateLoad(targetWeight, weightUnit, equipment);
  if (!load) return null;
  const { result, unit: plateUnit } = load;
  const unit = plateUnitLabel(t, plateUnit);

  const platesText = (plateLoad: PlateLoad) => {
    const plates = plateLoad.plates
      .flatMap((plate) =>
        Array.from({ length: plate.count }, () =>
          formatPlateWeight(plate.weight)
        )
      )
      .join(' + ');
    return plates === '' ? '0' : plates;
  };

  let body: React.ReactNode;
  if (result.status === 'exact' && result.load) {
    body = (
      <>
        <PlateBarDrawing
          load={result.load}
          unit={plateUnit}
          variant="compact"
          scale={PLATE_SCALE}
          testID="focus-plate-drawing"
        />
        <Text
          className="min-w-0 flex-1 text-xs text-text-secondary"
          numberOfLines={1}
        >
          <Text className="font-bold text-text-primary">
            {platesText(result.load)}
          </Text>{' '}
          {t('activeWorkout.focus.plates.perSideLower', {
            defaultValue: 'per side',
          })}
        </Text>
      </>
    );
  } else if (result.status === 'inexact' && result.below) {
    // The weight can't be made: draw the nearest weight that can, never
    // rounding the target itself.
    body = (
      <>
        <PlateBarDrawing
          load={result.below}
          unit={plateUnit}
          variant="compact"
          scale={PLATE_SCALE}
          testID="focus-plate-drawing"
        />
        <Text
          className="min-w-0 flex-1 text-xs text-text-secondary"
          numberOfLines={1}
        >
          {t('activeWorkout.focus.plates.nearest', {
            defaultValue: 'Nearest {{weight}} {{unit}}',
            weight: formatPlateWeight(result.below.totalWeight),
            unit,
          })}
          {' · '}
          {t('activeWorkout.focus.plates.perSideLower', {
            defaultValue: 'per side',
          })}{' '}
          <Text className="font-bold">{platesText(result.below)}</Text>
        </Text>
      </>
    );
  } else if (result.status === 'inexact') {
    body = (
      <Text className="min-w-0 flex-1 text-xs text-text-secondary">
        {t('plates.graphicBelowBar', {
          defaultValue: 'Plates: lighter than the bar',
        })}
      </Text>
    );
  } else {
    return null;
  }

  return (
    <Pressable
      testID="focus-plate-strip"
      onPress={onOpenCalculator}
      accessibilityRole="button"
      accessibilityLabel={t('activeWorkout.focus.plates.calculator', {
        defaultValue: 'Plate calculator',
      })}
      hitSlop={{ top: 8, bottom: 10, left: 16, right: 16 }}
      className="min-h-6 flex-row items-center gap-2 active:opacity-70"
    >
      {body}
    </Pressable>
  );
}

export default React.memo(FocusPlateStrip);
