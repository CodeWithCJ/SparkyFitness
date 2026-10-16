import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
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
 * was taken so a drop after a dose is easy to see.
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
  const summary = t('symptoms.chart.summary', {
    defaultValue: 'Severity over the episode, {{count}} readings',
    count: layout.points.length,
  });

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
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
        <SvgText x={layout.left} y={H - 6} fontSize={9} fill={mutedColor}>
          {formatClock(layout.startIso)}
        </SvgText>
        <SvgText
          x={layout.right}
          y={H - 6}
          fontSize={9}
          textAnchor="end"
          fill={mutedColor}
        >
          {formatClock(layout.endIso)}
        </SvgText>
      </Svg>
    </View>
  );
};

export default SymptomSeverityChart;
