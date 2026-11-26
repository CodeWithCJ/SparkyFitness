import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import type { PlateLoad, PlateUnit } from '@workspace/shared';
import {
  plateColorKey,
  plateDimensions,
  plateUsesDarkLabel,
  type PlateColorKey,
} from '../utils/plateColors';
import { formatPlateWeight } from '../utils/plateFormat';
import { plateUnitLabel } from '../utils/plateUnitLabel';

export type PlateBarVariant = 'large' | 'compact';

interface DrawnPlate {
  key: string;
  weight: number;
  colorKey: PlateColorKey;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Labelled only when the plate is thick enough to carry its number. */
  label: string | null;
  labelSize: number;
}

interface BarLayout {
  width: number;
  height: number;
  /** The bar's vertical centre. */
  centerY: number;
  barThickness: number;
  plates: DrawnPlate[];
  /** The sleeve end and the collar next to it; large variant only. */
  sleeve: { x: number; y: number; width: number; height: number } | null;
  collar: { x: number; y: number; width: number; height: number } | null;
  clamp: { x: number; y: number; width: number; height: number } | null;
  barStart: number;
  barEnd: number;
}

const LARGE = { width: 358, height: 140, firstPlate: 60, gap: 6, end: 16 };
// The Active set strip: the same bar, scaled down and without the sleeve.
const COMPACT = {
  width: 110,
  height: 36,
  firstPlate: 36,
  gap: 3,
  end: 12,
  heightScale: 0.27,
  widthScale: 0.42,
};

/**
 * Lays one side of the bar out in drawing units: plates from the heaviest
 * outwards, each as tall as its weight says. Wide loads grow the canvas, which
 * the SVG then scales to fit.
 */
export function layoutBar(
  load: PlateLoad,
  unit: PlateUnit,
  variant: PlateBarVariant
): BarLayout {
  const compact = variant === 'compact';
  const spec = compact ? COMPACT : LARGE;
  const centerY = spec.height / 2;
  const plates: DrawnPlate[] = [];
  let x = spec.firstPlate;
  for (const plate of load.plates) {
    const size = plateDimensions(plate.weight, unit);
    const width = compact ? size.width * COMPACT.widthScale : size.width;
    const height = compact ? size.height * COMPACT.heightScale : size.height;
    for (let i = 0; i < plate.count; i += 1) {
      plates.push({
        key: `${plate.weight}-${i}`,
        weight: plate.weight,
        colorKey: plateColorKey(plate.weight, unit),
        x,
        y: centerY - height / 2,
        width,
        height,
        label:
          !compact && size.width >= 14 ? formatPlateWeight(plate.weight) : null,
        labelSize: size.width >= 22 ? 12 : 10,
      });
      x += width + spec.gap;
    }
  }
  const plateEnd = x - (plates.length > 0 ? spec.gap : 0);
  const clampX = plateEnd + 8;
  const width = Math.max(spec.width, clampX + (compact ? 0 : 10) + spec.end);
  return {
    width,
    height: spec.height,
    centerY,
    barThickness: compact ? 4 : 8,
    plates,
    sleeve: compact ? null : { x: 0, y: centerY - 6, width: 40, height: 12 },
    collar: compact ? null : { x: 40, y: centerY - 12, width: 12, height: 24 },
    clamp: compact
      ? null
      : { x: clampX, y: centerY - 10, width: 10, height: 20 },
    barStart: compact ? 0 : 52,
    barEnd: compact ? width : width - 16,
  };
}

/** "Per side: 25, 5, 1.25 kg", the plates read out for a screen reader. */
export function usePlateDrawingLabel(load: PlateLoad, unit: PlateUnit): string {
  const { t } = useTranslation();
  const plates = load.plates.flatMap((plate) =>
    Array.from({ length: plate.count }, () => formatPlateWeight(plate.weight))
  );
  const unitLabel = plateUnitLabel(t, unit);
  return plates.length === 0
    ? t('plates.drawingEmpty', {
        defaultValue: 'Per side: no plates, empty bar',
      })
    : t('plates.drawingLabel', {
        defaultValue: 'Per side: {{plates}} {{unit}}',
        plates: plates.join(', '),
        unit: unitLabel,
      });
}

interface Props {
  load: PlateLoad;
  unit: PlateUnit;
  variant?: PlateBarVariant;
  /** Multiplies the drawn size (the focus strip draws it small); 1 by default. */
  scale?: number;
  testID?: string;
}

const COLOR_TOKENS = [
  '--color-plate-red',
  '--color-plate-blue',
  '--color-plate-yellow',
  '--color-plate-green',
  '--color-plate-white',
  '--color-plate-grey',
  '--color-plate-steel',
  '--color-plate-sleeve',
  '--color-plate-label',
] as const;

/**
 * The one bar drawing the plate calculator and the Active set plate strip
 * share: a side view with sleeve, collar and the plates as vertical bars,
 * coloured by competition convention and as tall as their weight.
 */
function PlateBarDrawing({
  load,
  unit,
  variant = 'large',
  scale = 1,
  testID,
}: Props) {
  const label = usePlateDrawingLabel(load, unit);
  const [red, blue, yellow, green, white, grey, steel, sleeve, labelInk] =
    useCSSVariable([...COLOR_TOKENS]) as string[];
  const fills: Record<PlateColorKey, string> = {
    red,
    blue,
    yellow,
    green,
    white,
    grey,
  };
  const layout = layoutBar(load, unit, variant);
  const compact = variant === 'compact';
  const barY = layout.centerY - layout.barThickness / 2;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={
        compact
          ? {
              width: Math.min(layout.width, 150) * scale,
              height: layout.height * scale,
            }
          : { width: '100%', aspectRatio: layout.width / layout.height }
      }
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        pointerEvents="none"
      >
        {layout.sleeve && <Rect {...layout.sleeve} rx={3} fill={sleeve} />}
        {layout.collar && <Rect {...layout.collar} fill={steel} />}
        <Rect
          x={layout.barStart}
          y={barY}
          width={layout.barEnd - layout.barStart}
          height={layout.barThickness}
          rx={layout.barThickness / 2}
          fill={steel}
        />
        {layout.plates.map((plate) => (
          <G key={plate.key}>
            <Rect
              testID={`plate-${plate.weight}`}
              x={plate.x}
              y={plate.y}
              width={plate.width}
              height={plate.height}
              rx={compact ? 2 : 4}
              fill={fills[plate.colorKey]}
            />
            {plate.label != null && (
              <SvgText
                x={plate.x + plate.width / 2}
                y={layout.centerY + plate.labelSize / 3}
                fontSize={plate.labelSize}
                fontWeight="700"
                textAnchor="middle"
                fill={plateUsesDarkLabel(plate.colorKey) ? labelInk : 'white'}
              >
                {plate.label}
              </SvgText>
            )}
          </G>
        ))}
        {layout.clamp && <Rect {...layout.clamp} rx={3} fill={steel} />}
      </Svg>
    </View>
  );
}

export default React.memo(PlateBarDrawing);
