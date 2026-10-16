import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { useSerumCurve } from '../../hooks/useGlp1';

const CHART_HEIGHT = 140;

/**
 * Modeled serum level (one-compartment estimate from published half-lives).
 * It is an illustration, not a measurement; the server's disclaimer is always
 * shown under the chart.
 */
const Glp1SerumCard: React.FC<{ medicationId: string; title: string }> = ({
  medicationId,
  title,
}) => {
  const { t } = useTranslation();
  const { data, isLoading } = useSerumCurve(medicationId);
  const [width, setWidth] = useState(0);
  const [accent, muted] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-strong',
  ]) as [string, string];

  const curve = data?.curve ?? [];
  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  let linePath = '';
  let markers: number[] = [];
  if (width > 0 && curve.length > 1) {
    const minDay = curve[0]!.day;
    const maxDay = curve[curve.length - 1]!.day;
    const span = Math.max(maxDay - minDay, 1e-9);
    const xFor = (day: number) => ((day - minDay) / span) * width;
    const yFor = (fraction: number) =>
      CHART_HEIGHT -
      4 -
      Math.min(Math.max(fraction, 0), 1) * (CHART_HEIGHT - 8);
    linePath = curve
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'}${xFor(p.day).toFixed(1)} ${yFor(p.fraction).toFixed(1)}`
      )
      .join(' ');
    markers = (data?.doseDays ?? [])
      .filter((d) => d >= minDay && d <= maxDay)
      .map(xFor);
  }

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base font-semibold text-text-primary flex-1 mr-2">
          {t('medications.glp1.serum.title', {
            defaultValue: 'Modeled level: {{name}}',
            name: data?.drugName ?? title,
          })}
        </Text>
        {data?.currentLevelFraction != null && (
          <Text className="text-sm font-semibold text-text-secondary">
            {t('medications.glp1.serum.now', {
              defaultValue: '~{{percent}}% now',
              percent: Math.round(data.currentLevelFraction * 100),
            })}
          </Text>
        )}
      </View>
      {isLoading ? null : curve.length === 0 ? (
        <Text className="text-sm text-text-muted">
          {t('medications.glp1.serum.empty', {
            defaultValue:
              'Log injections to model your level. This needs a recognized GLP-1 drug set on the medication.',
          })}
        </Text>
      ) : (
        <>
          <View onLayout={onLayout}>
            {width > 0 && (
              <Svg width={width} height={CHART_HEIGHT}>
                {markers.map((x, i) => (
                  <Line
                    key={i}
                    x1={x}
                    x2={x}
                    y1={0}
                    y2={CHART_HEIGHT}
                    stroke={muted}
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                ))}
                <Path
                  d={linePath}
                  stroke={accent}
                  strokeWidth={2}
                  fill="none"
                />
              </Svg>
            )}
          </View>
          <Text className="text-xs text-text-muted mt-2">
            {data?.disclaimer}
          </Text>
        </>
      )}
    </View>
  );
};

export default Glp1SerumCard;
