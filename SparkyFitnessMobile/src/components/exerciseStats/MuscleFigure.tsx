import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import {
  heatLevel,
  maxDrawnMuscleSets,
  setsForMuscleKey,
  svgClassToMuscleKey,
  untrainedHeatLevel,
  type BodyFigure,
} from '@workspace/shared';
import { MUSCLE_FIGURES } from './muscleFigurePaths';

/** Heat levels 1-4, shared with the web heat map's legend. */
export const MUSCLE_HEAT_COLORS = [
  '#86efac',
  '#22c55e',
  '#eab308',
  '#e11d48',
] as const;

interface DrawnPath {
  d: string;
  outline: boolean;
  /** Figure region, or null for the outline and undrawn detail. */
  muscle: string | null;
  level: number;
}

interface MuscleFigureProps {
  figure: BodyFigure;
  setsByMuscle: Record<string, number>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  accessibilityLabel: string;
  /** Flips the colours so muscles with no working sets stand out. */
  untrained?: boolean;
}

/**
 * Front and back body figure, male or female, tinted by working sets on
 * primary muscles.
 * Each region is its own <Path> so a tap knows which muscle it hit.
 */
const MuscleFigure: React.FC<MuscleFigureProps> = ({
  figure,
  setsByMuscle,
  selectedKey,
  onSelect,
  accessibilityLabel,
  untrained = false,
}) => {
  const [bodyFill, outlineStroke, regionStroke, emptyFill, selectedStroke] =
    useCSSVariable([
      '--color-raised',
      '--color-border-strong',
      '--color-border',
      '--color-progress-track',
      '--color-text-primary',
    ]) as [string, string, string, string, string];

  const paths = useMemo<DrawnPath[]>(() => {
    const max = maxDrawnMuscleSets(setsByMuscle);
    const drawn = MUSCLE_FIGURES[figure].paths.map((path) => {
      const muscle = path.svgClass ? svgClassToMuscleKey(path.svgClass) : null;
      return {
        d: path.d,
        outline: path.outline,
        muscle,
        level: !muscle
          ? 0
          : untrained
            ? untrainedHeatLevel(setsForMuscleKey(muscle, setsByMuscle))
            : heatLevel(setsForMuscleKey(muscle, setsByMuscle), max),
      };
    });
    // The lats wrap around the back. Painting them last keeps them on top of
    // the neighbouring regions, as on the web figure.
    return [
      ...drawn.filter((path) => path.muscle !== 'lats'),
      ...drawn.filter((path) => path.muscle === 'lats'),
    ];
  }, [figure, setsByMuscle, untrained]);

  const { viewBox } = MUSCLE_FIGURES[figure];
  const [, , viewBoxWidth = 1, viewBoxHeight = 1] = viewBox
    .split(' ')
    .map(Number);

  return (
    <View
      style={{
        width: '100%',
        maxWidth: 420,
        aspectRatio: viewBoxWidth / viewBoxHeight,
      }}
      // One image to a screen reader; its muscles are picked from the
      // Sets per Muscle rows, which the label points to.
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={`muscle-figure-${figure}-body`}
    >
      <Svg width="100%" height="100%" viewBox={viewBox}>
        {paths.map((path, index) => {
          if (path.outline) {
            return (
              <Path
                key={index}
                d={path.d}
                fill={bodyFill}
                stroke={outlineStroke}
                strokeWidth={1}
              />
            );
          }
          const { muscle } = path;
          const selected = muscle !== null && muscle === selectedKey;
          const dimmed = selectedKey !== null && muscle !== null && !selected;
          return (
            <Path
              key={index}
              d={path.d}
              fill={
                path.level > 0 ? MUSCLE_HEAT_COLORS[path.level - 1] : emptyFill
              }
              stroke={selected ? selectedStroke : regionStroke}
              strokeWidth={selected ? 1.75 : 0.5}
              opacity={dimmed ? 0.22 : 1}
              testID={muscle ? `muscle-figure-${muscle}` : undefined}
              onPress={muscle ? () => onSelect(muscle) : undefined}
            />
          );
        })}
      </Svg>
    </View>
  );
};

export default MuscleFigure;
