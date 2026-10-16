import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Rect, Circle, Ellipse, Path, G } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import {
  getBuiltInSymptomLabels,
  translateBuiltInSymptomLabel,
} from '../../utils/symptomLabels';
import {
  BODY_REGIONS,
  HEAD_REGIONS,
  REGION_SHAPES,
  type MapKind,
  type MapView,
  type RegionShape,
  type SymptomRegion,
} from '@workspace/shared';

interface SymptomLocationPickerProps {
  kind: MapKind;
  selected: string[];
  onToggle: (label: string) => void;
}

export default function SymptomLocationPicker({
  kind,
  selected,
  onToggle,
}: SymptomLocationPickerProps) {
  const { t } = useTranslation();
  const builtInLabels = getBuiltInSymptomLabels(t);
  const [view, setView] = useState<MapView>('front');

  const regions: SymptomRegion[] =
    kind === 'head' ? HEAD_REGIONS : BODY_REGIONS;
  const visibleRegions = regions.filter((r) => r.view === view);
  const shapes = REGION_SHAPES[kind];
  const viewBox = kind === 'head' ? '0 0 120 144' : '0 0 120 264';
  const width = 160;
  const height = kind === 'head' ? 192 : 352;

  const isSelected = (label: string) => selected.includes(label);

  const renderShape = (
    shape: RegionShape,
    index: number,
    isHighlighted: boolean
  ) => {
    const fill = isHighlighted
      ? 'rgba(59, 130, 246, 0.65)'
      : 'rgba(148, 163, 184, 0.2)';
    const stroke = isHighlighted ? '#3b82f6' : '#94a3b8';

    switch (shape.tag) {
      case 'rect':
        return (
          <Rect
            key={index}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={shape.rx}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.5}
          />
        );
      case 'circle':
        return (
          <Circle
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.5}
          />
        );
      case 'ellipse':
        return (
          <Ellipse
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            rx={shape.rx}
            ry={shape.ry}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.5}
          />
        );
      case 'path':
        return (
          <Path
            key={index}
            d={shape.d}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.5}
          />
        );
    }
  };

  return (
    <View className="space-y-4">
      {/* Front / Back switch */}
      <View className="flex-row justify-center space-x-2">
        <TouchableOpacity
          onPress={() => setView('front')}
          className={`px-4 py-1.5 rounded-full border ${
            view === 'front'
              ? 'bg-accent-primary border-accent-primary'
              : 'bg-surface border-border'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              view === 'front' ? 'text-white' : 'text-text-primary'
            }`}
          >
            {t('symptoms.views.front', { defaultValue: 'Front' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setView('back')}
          className={`px-4 py-1.5 rounded-full border ${
            view === 'back'
              ? 'bg-accent-primary border-accent-primary'
              : 'bg-surface border-border'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              view === 'back' ? 'text-white' : 'text-text-primary'
            }`}
          >
            {t('symptoms.views.back', { defaultValue: 'Back' })}
          </Text>
        </TouchableOpacity>
      </View>

      <Text className="text-center text-xs text-text-muted">
        {t('symptoms.mapPerspective', {
          defaultValue: 'Left and right match your body',
        })}
      </Text>

      {/* SVG Interactive Canvas */}
      <View className="items-center justify-center py-2">
        <Svg width={width} height={height} viewBox={viewBox}>
          {/* Outline silhouettes */}
          {kind === 'head' ? (
            <Ellipse
              cx="60"
              cy="70"
              rx="44"
              ry="56"
              fill="rgba(203, 213, 225, 0.08)"
              stroke="#64748b"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          ) : (
            <G opacity="0.3">
              <Circle
                cx="60"
                cy="20"
                r="14"
                stroke="#64748b"
                strokeWidth="1"
                fill="none"
              />
              <Rect
                x="30"
                y="44"
                width="60"
                height="96"
                rx="10"
                stroke="#64748b"
                strokeWidth="1"
                fill="none"
              />
              <Rect
                x="42"
                y="140"
                width="36"
                height="100"
                rx="8"
                stroke="#64748b"
                strokeWidth="1"
                fill="none"
              />
            </G>
          )}

          {visibleRegions.map((region) => {
            const regionShapes = shapes[region.id] ?? [];
            const highlighted = isSelected(region.label);

            return (
              <G key={region.id} onPress={() => onToggle(region.label)}>
                {regionShapes.map((shape, idx) =>
                  renderShape(shape, idx, highlighted)
                )}
              </G>
            );
          })}
        </Svg>
      </View>

      {/* Fallback Chip list for accessibility & quick toggling */}
      <View className="flex-row flex-wrap gap-1.5 pt-2">
        {regions.map((region) => {
          const highlighted = isSelected(region.label);
          return (
            <TouchableOpacity
              key={region.id}
              onPress={() => onToggle(region.label)}
              className={`px-3 py-1.5 rounded-full border ${
                highlighted
                  ? 'bg-accent-primary/20 border-accent-primary'
                  : 'bg-surface border-border'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  highlighted ? 'text-accent-primary' : 'text-text-primary'
                }`}
              >
                {translateBuiltInSymptomLabel(builtInLabels, region.label)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
