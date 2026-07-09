import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';

export function formatRestCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

interface ActiveWorkoutRestBarProps {
  remainingMs: number;
  durationSec: number;
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
 * Bottom-docked rest bar, visible only while a rest timer exists (resting or
 * paused). A thin progress track on top, then a single control row —
 * pause/resume + −15s on the left, the countdown centered, +15s + skip on the
 * right — with the on-deck set + target centered beneath.
 *
 * The side clusters are `flex-1` around a fixed-width centered countdown so the
 * timer stays dead-center while the controls sit at the reachable edges. Sized
 * to keep every control on one row down to a ~320pt (iPhone SE) width.
 */
function ActiveWorkoutRestBar({
  remainingMs,
  durationSec,
  paused,
  label,
  nextSetText,
  onAdjust,
  onSkip,
  onPause,
  onResume,
}: ActiveWorkoutRestBarProps) {
  const insets = useSafeAreaInsets();
  const [accentPrimary, textMuted, trackColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-progress-track',
  ]) as [string, string, string];

  const progress =
    durationSec > 0 ? Math.max(0, Math.min(1, remainingMs / (durationSec * 1000))) : 0;

  const timerColor = paused ? textMuted : accentPrimary;

  return (
    <View
      className="bg-surface border-t border-border-subtle px-4 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
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
    </View>
  );
}

export default React.memo(ActiveWorkoutRestBar);
