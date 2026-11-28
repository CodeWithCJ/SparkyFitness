import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

export type EffortFaceBand = 'easy' | 'moderate' | 'hard' | 'max';

interface Props {
  band: EffortFaceBand;
  size: number;
  /** Face colour, the band's tone. */
  color: string;
  /** Eyes and mouth. */
  ink?: string;
}

/**
 * A flat face for how hard a set felt: a smile when easy, a straight mouth
 * when moderate, closed eyes and an open mouth when hard, crossed eyes at an
 * all-out effort. Decorative: the value and band label beside it carry the
 * meaning.
 */
function EffortFace({ band, size, color, ink = '#2A1A06' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <Circle cx={50} cy={50} r={50} fill={color} />
      {band === 'easy' && (
        <>
          <Circle cx={34} cy={42} r={6} fill={ink} />
          <Circle cx={66} cy={42} r={6} fill={ink} />
          <Path
            d="M30 60 Q50 80 70 60"
            stroke={ink}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
      {band === 'moderate' && (
        <>
          <Circle cx={34} cy={42} r={6} fill={ink} />
          <Circle cx={66} cy={42} r={6} fill={ink} />
          <Path
            d="M33 66 H67"
            stroke={ink}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </>
      )}
      {band === 'hard' && (
        <>
          <Path
            d="M24 42 H44 M56 42 H76"
            stroke={ink}
            strokeWidth={6}
            strokeLinecap="round"
          />
          <Ellipse cx={50} cy={67} rx={9} ry={11} fill={ink} />
        </>
      )}
      {band === 'max' && (
        <>
          <Path
            d="M26 34 L42 50 M42 34 L26 50 M58 34 L74 50 M74 34 L58 50"
            stroke={ink}
            strokeWidth={6}
            strokeLinecap="round"
          />
          <Path
            d="M32 70 Q40 62 50 70 Q60 78 68 70"
            stroke={ink}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
    </Svg>
  );
}

export default React.memo(EffortFace);
