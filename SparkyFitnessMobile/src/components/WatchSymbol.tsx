import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Platform } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ComplicationIcon } from '../utils/watchComplications';

interface WatchSymbolProps {
  /** An SF Symbol name from `COMPLICATION_ICONS`: the watch draws it by name. */
  name: string;
  size: number;
  color: string;
}

type AndroidGlyph =
  | { pack: 'ion'; name: keyof typeof Ionicons.glyphMap }
  | { pack: 'mci'; name: keyof typeof MaterialCommunityIcons.glyphMap };

const ANDROID_COMPLICATION_ICONS: Record<ComplicationIcon, AndroidGlyph> = {
  'flame.fill': { pack: 'ion', name: 'flame' },
  'fish.fill': { pack: 'ion', name: 'fish' },
  'leaf.fill': { pack: 'ion', name: 'leaf' },
  'drop.fill': { pack: 'ion', name: 'water' },
  'figure.walk': { pack: 'ion', name: 'walk' },
  timer: { pack: 'ion', name: 'timer' },
  'scalemass.fill': { pack: 'ion', name: 'scale' },
  'heart.fill': { pack: 'ion', name: 'heart' },
  'bolt.fill': { pack: 'ion', name: 'flash' },
  'fork.knife': { pack: 'ion', name: 'restaurant' },
  'chart.bar.fill': { pack: 'ion', name: 'bar-chart' },
  'gauge.with.dots.needle.33percent': { pack: 'ion', name: 'speedometer' },
  'bed.double.fill': { pack: 'ion', name: 'bed' },
  'moon.zzz.fill': { pack: 'ion', name: 'moon' },
  'waveform.path.ecg': { pack: 'ion', name: 'pulse' },
  'lungs.fill': { pack: 'mci', name: 'lungs' },
  'dumbbell.fill': { pack: 'ion', name: 'barbell' },
};

const FALLBACK_ANDROID_GLYPH: AndroidGlyph = {
  pack: 'ion',
  name: 'speedometer',
};

/**
 * A watch complication's icon. Uses SF Symbols on iOS and matching vector
 * glyphs on Android (Wear OS), keyed by the shared wire values in
 * `COMPLICATION_ICONS`.
 */
const WatchSymbol: React.FC<WatchSymbolProps> = ({ name, size, color }) => {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={name as SymbolViewProps['name']}
        size={size}
        tintColor={color}
      />
    );
  }
  const glyph =
    ANDROID_COMPLICATION_ICONS[name as ComplicationIcon] ??
    FALLBACK_ANDROID_GLYPH;
  if (glyph.pack === 'mci') {
    return (
      <MaterialCommunityIcons name={glyph.name} size={size} color={color} />
    );
  }
  return <Ionicons name={glyph.name} size={size} color={color} />;
};

export default WatchSymbol;
