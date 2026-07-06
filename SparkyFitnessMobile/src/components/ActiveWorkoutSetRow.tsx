import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InputAccessoryView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import type { ExerciseEntrySetResponse } from '@workspace/shared';
import Icon from './Icon';
import StepperInput from './StepperInput';
import { parseDecimalInput } from '../utils/numericInput';
import { weightFromKg, weightToKg } from '../utils/unitConversions';
import {
  epley1RmKg,
  estimateRepMaxKg,
  getRpeTone,
  setVolumeKg,
  type RpeTone,
} from '../utils/workoutSession';
import type { ActiveSetPatch } from '../stores/activeWorkoutStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';

export type SetRowState = 'done' | 'current' | 'upcoming';

const RPE_TONE_VARS: Record<RpeTone, string> = {
  easy: '--color-icon-success',
  moderate: '--color-cat-amber',
  hard: '--color-cat-orange',
  max: '--color-icon-danger',
};

function formatDisplayWeight(weightKg: number | null, unit: 'kg' | 'lbs'): string {
  if (weightKg == null) return '';
  return String(parseFloat(weightFromKg(weightKg, unit).toFixed(1)));
}

function formatMetricWeight(valueKg: number, unit: 'kg' | 'lbs'): string {
  if (valueKg <= 0) return '–';
  return Math.round(weightFromKg(valueKg, unit)).toLocaleString();
}

function formatRpe(rpe: number | null): string {
  if (rpe == null) return '–';
  return Number.isInteger(rpe) ? String(rpe) : rpe.toFixed(1);
}

/** Clamp a typed RPE to 1–10 in 0.5 steps; empty/invalid → null. */
export function parseRpeInput(text: string): number | null {
  const value = parseDecimalInput(text);
  if (Number.isNaN(value)) return null;
  const snapped = Math.round(value * 2) / 2;
  return Math.min(10, Math.max(1, snapped));
}

interface ActiveWorkoutSetRowProps {
  set: ExerciseEntrySetResponse;
  /** Working-set number. Warmup rows show the `W` pill instead. */
  displayNumber: number;
  state: SetRowState;
  metricColumn: ActiveWorkoutMetricColumn;
  weightUnit: 'kg' | 'lbs';
  onCompleteActive: () => void;
  onUncomplete: (setId: string) => void;
  onRecomplete: (setId: string) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  onDelete: (setId: string) => void;
  onLongPress: (setId: string) => void;
}

/** Pulsing accent ring — the tap-to-log target on the current row. */
function LogCircle({ color }: { color: string }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
    return () => {
      pulse.value = 1;
    };
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      style={[style, { borderColor: color }]}
      className="h-7 w-7 rounded-full border-2 items-center justify-center"
    >
      <View className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
    </Animated.View>
  );
}

function ActiveWorkoutSetRow({
  set,
  displayNumber,
  state,
  metricColumn,
  weightUnit,
  onCompleteActive,
  onUncomplete,
  onRecomplete,
  onCommitField,
  onDelete,
  onLongPress,
}: ActiveWorkoutSetRowProps) {
  const [
    accentPrimary,
    successColor,
    textMuted,
    chromeBg,
    chromeBorder,
    rpeEasy,
    rpeModerate,
    rpeHard,
    rpeMax,
  ] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-success',
    '--color-text-muted',
    '--color-chrome',
    '--color-chrome-border',
    RPE_TONE_VARS.easy,
    RPE_TONE_VARS.moderate,
    RPE_TONE_VARS.hard,
    RPE_TONE_VARS.max,
  ]) as [string, string, string, string, string, string, string, string, string];

  const rpeToneColors: Record<RpeTone, string> = useMemo(
    () => ({ easy: rpeEasy, moderate: rpeModerate, hard: rpeHard, max: rpeMax }),
    [rpeEasy, rpeModerate, rpeHard, rpeMax],
  );

  const setId = String(set.id);
  const isWarmup = set.set_type === 'warmup';

  // Local drafts while the row is current — committed on blur/step/log so the
  // store (kg) isn't rewritten on every keystroke of a decimal in progress.
  const [weightDraft, setWeightDraft] = useState(() =>
    formatDisplayWeight(set.weight, weightUnit),
  );
  const [repsDraft, setRepsDraft] = useState(() => (set.reps != null ? String(set.reps) : ''));
  const [rpeDraft, setRpeDraft] = useState(() => (set.rpe != null ? formatRpe(set.rpe) : ''));

  // Re-seed drafts when the underlying set changes (id churn after a recreate
  // save, unit change, or an external edit). Commits only happen on blur/step,
  // so a mid-typing clobber can't occur — the store doesn't move under a
  // focused row.
  const signature = `${set.id}|${set.weight}|${set.reps}|${set.rpe}|${weightUnit}`;
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    setWeightDraft(formatDisplayWeight(set.weight, weightUnit));
    setRepsDraft(set.reps != null ? String(set.reps) : '');
    setRpeDraft(set.rpe != null ? formatRpe(set.rpe) : '');
  }

  const weightInputRef = useRef<TextInput>(null);
  const repsInputRef = useRef<TextInput>(null);
  const rpeInputRef = useRef<TextInput>(null);

  const commitWeight = useCallback(
    (text: string) => {
      const value = parseDecimalInput(text);
      onCommitField(setId, {
        weight: Number.isNaN(value) ? null : weightToKg(value, weightUnit),
      });
    },
    [onCommitField, setId, weightUnit],
  );

  const commitReps = useCallback(
    (text: string) => {
      const value = parseInt(text, 10);
      onCommitField(setId, { reps: Number.isNaN(value) ? null : value });
    },
    [onCommitField, setId],
  );

  const commitRpe = useCallback(
    (text: string) => {
      const value = parseRpeInput(text);
      setRpeDraft(value != null ? formatRpe(value) : '');
      onCommitField(setId, { rpe: value });
    },
    [onCommitField, setId],
  );

  const handleStepWeight = useCallback(
    (direction: number) => {
      const current = parseDecimalInput(weightDraft) || 0;
      const next = Math.max(0, current + direction * 5);
      setWeightDraft(String(next));
      commitWeight(String(next));
    },
    [weightDraft, commitWeight],
  );

  const handleStepReps = useCallback(
    (direction: number) => {
      const current = parseInt(repsDraft, 10) || 0;
      const next = Math.max(0, current + direction);
      setRepsDraft(String(next));
      commitReps(String(next));
    },
    [repsDraft, commitReps],
  );

  // Log the set: flush any in-progress edits first so the values the user
  // sees are exactly what gets completed (and autosaved).
  const handleLog = useCallback(() => {
    commitWeight(weightDraft);
    commitReps(repsDraft);
    if (metricColumn === 'rpe') commitRpe(rpeDraft);
    onCompleteActive();
  }, [
    commitWeight,
    commitReps,
    commitRpe,
    metricColumn,
    onCompleteActive,
    weightDraft,
    repsDraft,
    rpeDraft,
  ]);

  const metricValue = ((): { text: string; color?: string } => {
    switch (metricColumn) {
      case 'rpe': {
        if (set.rpe == null) return { text: '–' };
        return { text: formatRpe(set.rpe), color: rpeToneColors[getRpeTone(set.rpe)] };
      }
      case 'volume':
        return { text: formatMetricWeight(setVolumeKg(set), weightUnit) };
      case 'e1rm':
        return { text: formatMetricWeight(epley1RmKg(set.weight, set.reps), weightUnit) };
      case 'tenrm':
        return {
          text: formatMetricWeight(estimateRepMaxKg(set.weight, set.reps, 10), weightUnit),
        };
    }
  })();

  const setIndicator = isWarmup ? (
    <View className="h-5 w-5 rounded-md bg-raised items-center justify-center">
      <Text className="text-[11px] font-bold text-text-muted">W</Text>
    </View>
  ) : (
    <Text
      className="text-sm text-text-muted"
      style={[
        { fontVariant: ['tabular-nums'] },
        state === 'current' ? { color: accentPrimary, fontWeight: '700' } : null,
      ]}
    >
      {displayNumber}
    </Text>
  );

  const checkControl = (() => {
    if (state === 'done') {
      return (
        <Pressable
          onPress={() => onUncomplete(setId)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Un-complete set ${set.set_number}`}
          className="h-7 w-7 rounded-full items-center justify-center"
          style={{ backgroundColor: successColor }}
        >
          <Icon name="checkmark" size={16} color="#ffffff" weight="bold" />
        </Pressable>
      );
    }
    if (state === 'current') {
      return (
        <Pressable
          onPress={handleLog}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Log set"
        >
          <LogCircle color={accentPrimary} />
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={() => onRecomplete(setId)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Mark set ${set.set_number} complete`}
        className="h-7 w-7 rounded-full border-2"
        style={{ borderColor: textMuted, opacity: 0.5 }}
      />
    );
  })();

  const accessoryId = `active-set-${setId}`;
  const iosAccessoryProps =
    Platform.OS === 'ios' ? { inputAccessoryViewID: accessoryId } : {};

  if (state === 'current') {
    return (
      <>
        <Pressable
          testID="set-row"
          onLongPress={() => onLongPress(setId)}
          className="flex-row items-center py-2 px-3 rounded-xl"
          style={{ backgroundColor: `${accentPrimary}1f` }}
        >
          <View className="w-9 items-center">{setIndicator}</View>
          <View className="flex-1 items-center">
            <StepperInput
              compact
              value={weightDraft}
              onChangeText={setWeightDraft}
              onBlur={() => commitWeight(weightDraft)}
              onIncrement={() => handleStepWeight(1)}
              onDecrement={() => handleStepWeight(-1)}
              keyboardType="decimal-pad"
              inputRef={weightInputRef}
              inputProps={iosAccessoryProps}
            />
          </View>
          <View className="flex-1 items-center">
            <StepperInput
              compact
              value={repsDraft}
              onChangeText={setRepsDraft}
              onBlur={() => commitReps(repsDraft)}
              onIncrement={() => handleStepReps(1)}
              onDecrement={() => handleStepReps(-1)}
              keyboardType="number-pad"
              inputRef={repsInputRef}
              inputProps={iosAccessoryProps}
            />
          </View>
          <View className="w-14 items-center">
            {metricColumn === 'rpe' ? (
              <TextInput
                ref={rpeInputRef}
                value={rpeDraft}
                onChangeText={setRpeDraft}
                onBlur={() => commitRpe(rpeDraft)}
                keyboardType="decimal-pad"
                placeholder="–"
                placeholderTextColor={textMuted}
                className="w-11 rounded-lg bg-raised px-1 py-1 text-center text-sm text-text-primary"
                accessibilityLabel="RPE"
                {...iosAccessoryProps}
              />
            ) : (
              <Text
                className="text-sm text-text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {metricValue.text}
              </Text>
            )}
          </View>
          <View className="w-10 items-center">{checkControl}</View>
        </Pressable>
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={accessoryId}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                paddingHorizontal: 16,
                paddingVertical: 8,
                backgroundColor: chromeBg,
                borderTopWidth: 1,
                borderTopColor: chromeBorder,
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  weightInputRef.current?.blur();
                  repsInputRef.current?.blur();
                  rpeInputRef.current?.blur();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: accentPrimary, fontWeight: '600', fontSize: 16 }}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        )}
      </>
    );
  }

  const displayWeight = set.weight != null ? formatDisplayWeight(set.weight, weightUnit) : '—';
  const displayReps = set.reps != null ? String(set.reps) : '—';

  return (
    <ReanimatedSwipeable
      renderRightActions={() => (
        <TouchableOpacity
          className="bg-bg-danger justify-center items-center"
          style={{ width: 72 }}
          onPress={() => onDelete(setId)}
          activeOpacity={0.7}
          accessibilityLabel={`Delete set ${set.set_number}`}
        >
          <Text className="text-text-danger font-semibold text-sm">Delete</Text>
        </TouchableOpacity>
      )}
      overshootRight={false}
      rightThreshold={40}
    >
      <Pressable
        testID="set-row"
        onLongPress={() => onLongPress(setId)}
        className="flex-row items-center py-2.5 px-3 bg-background"
        style={state === 'done' ? { opacity: 0.62 } : undefined}
      >
        <View className="w-9 items-center">{setIndicator}</View>
        <Text
          className="flex-1 text-center text-sm text-text-primary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {displayWeight}
        </Text>
        <Text
          className="flex-1 text-center text-sm text-text-primary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {displayReps}
        </Text>
        <Text
          className="w-14 text-center text-sm"
          style={[
            { fontVariant: ['tabular-nums'] },
            { color: metricValue.color ?? textMuted },
          ]}
        >
          {metricValue.text}
        </Text>
        <View className="w-10 items-center">{checkControl}</View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default React.memo(ActiveWorkoutSetRow);
