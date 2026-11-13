import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import { SYMPTOM_IMPACT_LEVELS, type SymptomImpact } from '@workspace/shared';
import { getAppLocale } from '../../localization';
import {
  layoutSeverityChart,
  type SeverityChartInput,
} from '../../utils/symptomReport';

const W = 300;
const H = 140;
const BOX = {
  width: W,
  height: H,
  padLeft: 26,
  padRight: 10,
  padTop: 10,
  padBottom: 24,
};
/** The effect-on-the-day band below the plot: its height and the space it adds. */
const BAND = { height: 8, extra: 14 };

/** One colour per effect level, the same as on the web chart. */
const IMPACT_COLOR: Record<SymptomImpact, { fill: string; swatch: string }> = {
  none: { fill: '#22c55e', swatch: 'bg-green-500' },
  mild: { fill: '#fbbf24', swatch: 'bg-amber-400' },
  moderate: { fill: '#f97316', swatch: 'bg-orange-500' },
  severe: { fill: '#ef4444', swatch: 'bg-red-500' },
};

interface SymptomSeverityChartProps {
  entry: SeverityChartInput;
  /** Top of the y axis, from the symptom's scale. */
  max: number;
}

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString(getAppLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Severity over the length of an episode, with a marker where each treatment
 * was taken so a drop after a dose is easy to see. When the episode records its
 * effect on the day, a band below the plot shows each level from the time it
 * was recorded, with a legend so the colours read without a tap.
 */
const SymptomSeverityChart: React.FC<SymptomSeverityChartProps> = ({
  entry,
  max,
}) => {
  const { t } = useTranslation();
  const [lineColor, gridColor, mutedColor, markColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-border',
    '--color-text-muted',
    '--color-icon-success',
  ]) as [string, string, string, string];

  const layout = useMemo(
    () => layoutSeverityChart(entry, max, BOX),
    [entry, max]
  );
  if (!layout) return null;

  const path = layout.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`)
    .join(' ');
  const impactNames: Record<SymptomImpact, string> = {
    none: t('symptoms.impacts.none', { defaultValue: 'None' }),
    mild: t('symptoms.impacts.mild', { defaultValue: 'Mild' }),
    moderate: t('symptoms.impacts.moderate', { defaultValue: 'Moderate' }),
    severe: t('symptoms.impacts.severe', { defaultValue: 'Severe' }),
  };
  const impactName = (level: SymptomImpact) => impactNames[level];
  const impactLabel = t('symptoms.impact', { defaultValue: 'Impact on Day' });
  const hasBand = layout.band.length > 0;
  const height = hasBand ? H + BAND.extra : H;
  const bandY = H - BOX.padBottom + 4;

  const severitySummary = t('symptoms.chart.summary', {
    defaultValue: 'Severity over the episode, {{count}} readings',
    count: layout.points.length,
  });
  // The chart is one image to a screen reader, so the recorded levels and
  // their times are part of its label.
  const summary = hasBand
    ? `${severitySummary}. ${impactLabel}: ${layout.band
        .map((s) => `${impactName(s.impact)} ${formatClock(s.at)}`)
        .join(', ')}`
    : severitySummary;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <Svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height}>
        {layout.ticks.map((tick, i) => (
          <React.Fragment key={`tick-${i}`}>
            <Line
              x1={layout.left}
              x2={layout.right}
              y1={tick.y}
              y2={tick.y}
              stroke={gridColor}
              strokeWidth={1}
            />
            <SvgText
              x={layout.left - 6}
              y={tick.y + 3}
              fontSize={9}
              textAnchor="end"
              fill={mutedColor}
            >
              {tick.value}
            </SvgText>
          </React.Fragment>
        ))}
        {layout.marks.map((mark) => (
          <React.Fragment key={mark.id}>
            <Line
              x1={mark.x}
              x2={mark.x}
              y1={layout.top}
              y2={layout.bottom}
              stroke={markColor}
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <SvgText
              x={mark.x + 3}
              y={layout.top + 8}
              fontSize={9}
              fill={markColor}
            >
              {mark.name}
            </SvgText>
          </React.Fragment>
        ))}
        <Path
          d={path}
          fill="none"
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {layout.points.map((p, i) => (
          <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3.5} fill={lineColor} />
        ))}
        {layout.band.map((s, i) => (
          <Rect
            key={`band-${i}`}
            testID={`impact-band-${s.impact}`}
            x={s.x}
            y={bandY}
            width={s.width}
            height={BAND.height}
            rx={2}
            fill={IMPACT_COLOR[s.impact].fill}
          />
        ))}
        <SvgText x={layout.left} y={height - 6} fontSize={9} fill={mutedColor}>
          {formatClock(layout.startIso)}
        </SvgText>
        <SvgText
          x={layout.right}
          y={height - 6}
          fontSize={9}
          textAnchor="end"
          fill={mutedColor}
        >
          {formatClock(layout.endIso)}
        </SvgText>
      </Svg>
      {hasBand && (
        <View className="flex-row flex-wrap items-center mt-1">
          <Text className="text-[11px] text-text-muted mr-3 mb-1">
            {impactLabel}
          </Text>
          {SYMPTOM_IMPACT_LEVELS.map((level) => (
            <View key={level} className="flex-row items-center mr-3 mb-1">
              <View
                className={`w-2.5 h-2.5 rounded-sm mr-1.5 ${IMPACT_COLOR[level].swatch}`}
              />
              <Text className="text-[11px] text-text-muted">
                {impactName(level)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default SymptomSeverityChart;
