import { LOG_LOCKED_OPACITY, useFocusLogLocked } from './focusLogLock';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { HeroLabel, HeroStepper } from './FocusSetCells';
import FocusTimerRing from './FocusTimerRing';
import Icon from './Icon';
import { withAlpha } from '../utils/colors';
import { formatRestCountdown } from '../utils/workoutSession';

const RING_SIZE = 208;
/** Seconds a -/+ tap moves the planned length. */
const STEP_SEC = 5;
const MIN_SEC = 5;

interface FocusHoldReadyCardProps {
  /** "Set 2", shown with "Ready" above the ring. */
  setLabel: string;
  /** Planned length in seconds; null runs a stopwatch instead. */
  targetSec: number | null;
  /** Writes the planned length (seconds) to the set. */
  onChangeSeconds: (seconds: number) => void;
  /** Begins the hold (Get ready first when the watch setting has it on). */
  onStart: () => void;
}

/**
 * The timed hold's current-set card before it starts: the planned length in
 * the ring, a seconds stepper to change it and a full-width Start hold button.
 * Once started, `FocusHoldPanel` takes the same place.
 */
function FocusHoldReadyCard({
  setLabel,
  targetSec,
  onChangeSeconds,
  onStart,
}: FocusHoldReadyCardProps) {
  const { t } = useTranslation();
  const logLocked = useFocusLogLocked();
  const [holdColor, onHold, holdText] = useCSSVariable([
    '--color-hold',
    '--color-on-hold',
    '--color-hold-text',
  ]) as [string, string, string];
  const seedText = targetSec != null ? String(targetSec) : '';
  // Null while the field is not being typed in: it shows the set's length.
  const [draft, setDraft] = useState<string | null>(null);

  const commitDraft = () => {
    const parsed = Math.round(Number(draft));
    setDraft(null);
    if (draft == null || !Number.isFinite(parsed) || parsed < MIN_SEC) return;
    if (parsed !== targetSec) onChangeSeconds(parsed);
  };
  const step = (delta: number) => {
    setDraft(null);
    const next = Math.max(MIN_SEC, (targetSec ?? 0) + delta);
    if (next !== targetSec) onChangeSeconds(next);
  };
  const startLabel = t('activeWorkout.focus.hold.startHold', {
    defaultValue: 'Start hold',
  });

  return (
    <View
      testID="focus-hold-ready"
      className="mb-0.5 items-center gap-2.5 rounded-[20px] p-2"
      style={{
        backgroundColor: withAlpha(holdColor, 0.1),
        borderWidth: 2,
        borderColor: holdColor,
      }}
    >
      <View className="w-full flex-row items-center justify-between">
        <Text
          className="text-[17px] font-bold"
          style={{ color: holdText }}
          accessibilityRole="header"
        >
          {`${setLabel} · ${t('activeWorkout.focus.hold.ready', {
            defaultValue: 'Ready',
          })}`}
        </Text>
        {targetSec != null && (
          <Text
            className="text-[14px] text-text-secondary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {t('activeWorkout.focus.hold.plan', {
              defaultValue: 'Plan {{time}}',
              time: formatRestCountdown(targetSec * 1000),
            })}
          </Text>
        )}
      </View>
      <FocusTimerRing
        size={RING_SIZE}
        strokeWidth={14}
        progress={1}
        color={holdColor}
        trackColor={withAlpha(holdColor, 0.22)}
      >
        <Text
          className="text-[64px] font-bold"
          style={{
            color: holdText,
            fontVariant: ['tabular-nums'],
            lineHeight: 72,
          }}
        >
          {formatRestCountdown((targetSec ?? 0) * 1000)}
        </Text>
        <Text className="text-[16px] text-text-secondary">
          {targetSec != null
            ? t('activeWorkout.focus.hold.planWord', { defaultValue: 'plan' })
            : t('activeWorkout.focus.hold.stopwatch', {
                defaultValue: 'stopwatch',
              })}
        </Text>
      </FocusTimerRing>
      <View className="w-full gap-1">
        <HeroLabel>
          {t('activeWorkout.focus.hold.timeSeconds', {
            defaultValue: 'Time (s)',
          })}
        </HeroLabel>
        <HeroStepper
          value={draft ?? seedText}
          onChangeText={setDraft}
          onBlur={commitDraft}
          keyboardType="number-pad"
          placeholder="–"
          accessibilityLabel={t('activeWorkout.focus.hold.timeInput', {
            defaultValue: 'Hold time in seconds',
          })}
          decrementLabel={t('activeWorkout.focus.hold.decreaseTime', {
            defaultValue: 'Decrease hold time',
          })}
          incrementLabel={t('activeWorkout.focus.hold.increaseTime', {
            defaultValue: 'Increase hold time',
          })}
          onDecrement={() => step(-STEP_SEC)}
          onIncrement={() => step(STEP_SEC)}
        />
      </View>
      <Pressable
        testID="focus-hold-start"
        onPress={onStart}
        disabled={logLocked}
        accessibilityRole="button"
        accessibilityState={{ disabled: logLocked }}
        accessibilityLabel={startLabel}
        className="h-14 w-full flex-row items-center justify-center gap-2.5 rounded-full active:opacity-80"
        style={{
          backgroundColor: holdColor,
          opacity: logLocked ? LOG_LOCKED_OPACITY : 1,
        }}
      >
        <Icon name="play" size={20} color={onHold} />
        <Text className="text-[20px] font-bold" style={{ color: onHold }}>
          {startLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export default React.memo(FocusHoldReadyCard);
