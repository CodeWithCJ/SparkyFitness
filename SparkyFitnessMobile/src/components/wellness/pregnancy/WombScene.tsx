import React from 'react';
import Svg, { Path, Circle, Ellipse, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { useWellnessTokens } from '../theme/wellnessTokens';

interface WombSceneProps {
  /** Committed illustration stage from shared BABY_DEVELOPMENT.wombScene (8, 20, or 36). */
  scene: 8 | 20 | 36;
  size?: number;
}

// Per-stage baby scale + vertical offset within the 100x100 womb viewBox. The
// baby grows and settles lower (head-down) as the pregnancy progresses.
const STAGE: Record<8 | 20 | 36, { babyR: number; cx: number; cy: number; curl: number }> = {
  8: { babyR: 9, cx: 50, cy: 46, curl: 0.55 },
  20: { babyR: 15, cx: 50, cy: 50, curl: 0.7 },
  36: { babyR: 22, cx: 50, cy: 54, curl: 0.85 },
};

/**
 * Illustrated, theme-aware "in the womb" scene rendered as scalable SVG (no
 * static assets). The baby's size and position advance with the trimester
 * stage. Colors come from the wellness palette + app surface tokens so it
 * reads correctly in light, dark, and AMOLED.
 */
const WombScene: React.FC<WombSceneProps> = ({ scene, size = 120 }) => {
  const tokens = useWellnessTokens();
  const [surface] = useCSSVariable(['--color-surface']) as [string];
  const stage = STAGE[scene];
  const gradId = `womb-grad-${scene}`;

  // Baby curl: head + body as two overlapping circles, tucked.
  const bodyR = stage.babyR;
  const headR = bodyR * stage.curl;
  const headCx = stage.cx + bodyR * 0.15;
  const headCy = stage.cy - bodyR * 0.75;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tokens.accentMuted} stopOpacity="0.55" />
          <Stop offset="1" stopColor={tokens.accent} stopOpacity="0.75" />
        </LinearGradient>
      </Defs>

      {/* Womb silhouette — a soft rounded uterine shape. */}
      <Path
        d="M50 12
           C70 12 84 26 84 48
           C84 72 68 90 50 90
           C32 90 16 72 16 48
           C16 26 30 12 50 12 Z"
        fill={`url(#${gradId})`}
      />
      {/* Inner amniotic space. */}
      <Ellipse cx="50" cy="52" rx="28" ry="30" fill={surface} opacity={0.35} />

      {/* Baby: body + tucked head. */}
      <Circle cx={stage.cx} cy={stage.cy} r={bodyR} fill={tokens.phasePregnant} opacity={0.95} />
      <Circle cx={headCx} cy={headCy} r={headR} fill={tokens.phasePregnant} />
    </Svg>
  );
};

export default WombScene;
