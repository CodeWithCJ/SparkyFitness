import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassViewProps,
} from 'expo-glass-effect';
import { useCSSVariable } from 'uniwind';

import { withAlpha } from '../utils/colors';

export const LIQUID_GLASS_HORIZONTAL_MARGIN = 20;
export const LIQUID_GLASS_VERTICAL_GAP = 6;

export function createLiquidGlassPillStyle(
  chromeBorder: string,
  overrides: ViewStyle = {},
): ViewStyle {
  return {
    marginHorizontal: LIQUID_GLASS_HORIZONTAL_MARGIN,
    marginBottom: LIQUID_GLASS_VERTICAL_GAP,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(chromeBorder, 0.45),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    ...overrides,
  };
}

let glassAvailable: boolean | undefined;

function canUseLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  if (glassAvailable === undefined) {
    try {
      glassAvailable = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
    } catch {
      glassAvailable = false;
    }
  }
  return glassAvailable;
}

type LiquidGlassSurfaceProps = ViewProps & {
  colorScheme?: GlassViewProps['colorScheme'];
  glassEffectStyle?: GlassViewProps['glassEffectStyle'];
  isInteractive?: GlassViewProps['isInteractive'];
};

const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  colorScheme = 'auto',
  glassEffectStyle = 'regular',
  isInteractive = false,
  style,
  ...props
}) => {
  const fallbackBackground = useCSSVariable('--color-chrome') as string;

  if (!canUseLiquidGlass()) {
    return (
      <View
        {...props}
        style={[{ backgroundColor: fallbackBackground }, style]}
      />
    );
  }

  return (
    <GlassView
      {...props}
      style={style}
      colorScheme={colorScheme}
      glassEffectStyle={glassEffectStyle}
      isInteractive={isInteractive}
    />
  );
};

export default LiquidGlassSurface;
