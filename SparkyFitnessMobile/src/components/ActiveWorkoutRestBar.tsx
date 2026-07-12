import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import LiquidGlassSurface, { createLiquidGlassPillStyle } from './LiquidGlassSurface';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';

export function formatRestCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

/**
 * Scroll clearance the workout log needs above the floating glass variant so
 * the last card and the End Workout button can scroll out from under the pill
 * (content height ≈ 112 + the pill's bottom gap + breathing room).
 */
export const REST_BAR_GLASS_CLEARANCE = 128;

/**
 * Taller than the HUD's stadium pill, so a matching 999 radius would curve
 * into the progress track's corners; this keeps the same glass language with
 * corners the content clears.
 */
const GLASS_BORDER_RADIUS = 28;

interface ActiveWorkoutRestBarProps {
  remainingMs: number;
  /** Fraction of the rest remaining, 0..1 (see `useRestCountdown`). */
  progress: number;
  paused: boolean;
  /** What's up next, e.g. "Incline DB Press · Set 3". */
  label: string;
  /** Target load for the on-deck set, e.g. "135 lbs × 8". Null hides the line. */
  nextSetText?: string | null;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
}

/**
 * Rest bar, visible only while a rest timer exists (resting or paused). A thin
 * progress track on top, then a single control row — pause/resume + −15s on
 * the left, the countdown centered, +15s + skip on the right — with the
 * on-deck set + target centered beneath.
 *
 * The side clusters are `flex-1` around a fixed-width centered countdown so the
 * timer stays dead-center while the controls sit at the reachable edges. Sized
 * to keep every control on one row down to a ~320pt (iPhone SE) width.
 *
 * Chrome follows the workout HUD's: with Liquid Glass tabs active the bar is a
 * floating glass pill overlaying the log (the screen reserves
 * `REST_BAR_GLASS_CLEARANCE` of scroll padding for it); otherwise it is a
 * bottom-docked strip in normal flow.
 */
function ActiveWorkoutRestBar({
  remainingMs,
  progress,
  paused,
  label,
  nextSetText,
  onAdjust,
  onSkip,
  onPause,
  onResume,
}: ActiveWorkoutRestBarProps) {
  const insets = useSafeAreaInsets();
  const usesGlass = useNativeIOSTabsActive();
  const [accentPrimary, textMuted, trackColor, chromeBorder] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-progress-track',
    '--color-chrome-border',
  ]) as [string, string, string, string];

  const timerColor = paused ? textMuted : accentPrimary;

  const content = (
    <>
      <View
        className="h-1 rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: trackColor }}
      >
        <View
          testID="rest-progress-fill"
          className="h-full rounded-full"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: timerColor,
          }}
        />
      </View>

      <View className="flex-row items-center">
        <View className="flex-1 flex-row items-center" style={{ gap: 7 }}>
          <Pressable
            onPress={paused ? onResume : onPause}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume rest' : 'Pause rest'}
            className="h-9 w-9 rounded-full bg-raised items-center justify-center"
          >
            <Icon
              name={paused ? 'play' : 'pause'}
              size={18}
              color={accentPrimary}
              weight="bold"
            />
          </Pressable>
          <Pressable
            onPress={() => onAdjust(-15)}
            accessibilityRole="button"
            accessibilityLabel="Shorten rest by 15 seconds"
            className="rounded-full bg-raised px-3 py-2"
          >
            <Text
              className="text-sm font-semibold text-text-primary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              −15s
            </Text>
          </Pressable>
        </View>

        <Text
          className="px-2 text-3xl font-bold"
          style={{ color: timerColor, fontVariant: ['tabular-nums'] }}
        >
          {formatRestCountdown(remainingMs)}
        </Text>

        <View
          className="flex-1 flex-row items-center justify-end"
          style={{ gap: 7 }}
        >
          <Pressable
            onPress={() => onAdjust(15)}
            accessibilityRole="button"
            accessibilityLabel="Extend rest by 15 seconds"
            className="rounded-full bg-raised px-3 py-2"
          >
            <Text
              className="text-sm font-semibold text-text-primary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              +15s
            </Text>
          </Pressable>
          <Pressable
            onPress={onSkip}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Skip rest"
            className="h-9 w-9 rounded-full items-center justify-center"
            style={{ backgroundColor: accentPrimary }}
          >
            <Icon name="skip-forward" size={16} color="#ffffff" weight="bold" />
          </Pressable>
        </View>
      </View>

      {label.length > 0 && (
        <View className="items-center mt-1.5">
          <Text
            numberOfLines={1}
            className="text-sm font-medium text-text-primary"
          >
            {label}
          </Text>
          {nextSetText != null && nextSetText.length > 0 && (
            <Text
              numberOfLines={1}
              className="text-xs text-text-secondary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              Target {nextSetText}
            </Text>
          )}
        </View>
      )}
    </>
  );

  if (usesGlass) {
    return (
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 bottom-0"
        style={{ paddingBottom: insets.bottom }}
      >
        <LiquidGlassSurface
          testID="rest-bar-glass"
          style={createLiquidGlassPillStyle(chromeBorder, {
            borderRadius: GLASS_BORDER_RADIUS,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 12,
          })}
          colorScheme="auto"
          glassEffectStyle="regular"
          isInteractive
        >
          {content}
        </LiquidGlassSurface>
      </View>
    );
  }

  return (
    <View
      className="bg-surface border-t border-border-subtle px-4 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {content}
    </View>
  );
}

export default React.memo(ActiveWorkoutRestBar);
