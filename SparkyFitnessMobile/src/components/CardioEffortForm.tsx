import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, type TextInput } from 'react-native';
import { useCSSVariable } from 'uniwind';
import CompletionCheck, { LogCircle } from './CompletionCheck';
import {
  SetCellInput,
  type SetInputField,
  type SetRowAccessoryHandle,
} from './SetRowChrome';
import type { SetRowState } from './ActiveWorkoutSetRow';
import { distanceFromKm, distanceToKm } from '../utils/unitConversions';
import { parseDecimalInput } from '../utils/numericInput';
import {
  type AssumedSetValues,
  type WorkoutCardSet,
} from '../utils/workoutSession';
import type { ActiveSetPatch } from '../stores/activeWorkoutStore';

function minutesDisplayText(durationSec: number | null | undefined): string {
  return durationSec != null ? String(parseFloat((durationSec / 60).toFixed(2))) : '';
}

function distanceDisplayText(
  distanceKm: number | null | undefined,
  distanceUnit: 'km' | 'miles',
): string {
  return distanceKm != null
    ? String(parseFloat(distanceFromKm(distanceKm, distanceUnit).toFixed(2)))
    : '';
}

interface CardioEffortFormProps {
  /**
   * The single set backing the cardio effort (`sets[0]`), or null for a
   * legacy set-less entry in view mode. Duration is seconds, distance km.
   */
  set: WorkoutCardSet | null;
  exerciseName: string;
  mode: 'live' | 'view' | 'edit';
  distanceUnit: 'km' | 'miles';
  /**
   * Live only: the set's row state, derived by the card exactly like a table
   * row's — it picks the same log affordance the set rows use (done check /
   * pulsing cursor ring / muted upcoming ring).
   */
  state?: SetRowState;
  /**
   * Live only: assumed duration/distance for still-empty fields (previous
   * session or the preset plan — the same sources the store's completion
   * adoption uses). An empty input renders the assumed value as its
   * placeholder, exactly like the set-table cells.
   */
  assumed?: AssumedSetValues | null;
  /**
   * Commit a duration (seconds) or distance (km) patch for the set. Live
   * commits to the store; the form lists convert back to draft text.
   */
  onCommitField?: (setId: string, patch: ActiveSetPatch) => void;
  /** Live only: the completion affordance, so the workout cursor advances. */
  onComplete?: (setId: string) => void;
  onUncomplete?: (setId: string) => void;
  /**
   * Stable render key for the backing set (the store's `setRenderKeys`
   * mapping) — accessory-handle registration is keyed by it so the screen
   * bar keeps dispatching here across an autosave id churn. Defaults to the
   * set id.
   */
  renderKey?: string;
  /**
   * Live only: report a focused input so the screen can mark the focused set
   * and target its sticky accessory bar. The form's field walk is
   * duration → distance.
   */
  onActivateSet?: (setId: string, field: Exclude<SetInputField, 'rpe'>) => void;
  /** Live only: register the form's accessory handle, keyed by render key. */
  onRegisterAccessoryHandle?: (
    key: string,
    handle: SetRowAccessoryHandle | null,
  ) => void;
}

/**
 * The Duration+Distance form a cardio (`duration_distance`) exercise renders
 * in place of a set table when it has at most one set. Duration is entered in
 * minutes and stored as integer seconds on the set; distance is entered in
 * the user's display unit and stored as km. Multi-set cardio entries (imports,
 * future intervals) keep the duration-style set table instead — see the
 * ≤1-set gate in ActiveWorkoutExerciseCard.
 */
export default function CardioEffortForm({
  set,
  exerciseName,
  mode,
  distanceUnit,
  state = 'upcoming',
  assumed,
  onCommitField,
  onComplete,
  onUncomplete,
  renderKey,
  onActivateSet,
  onRegisterAccessoryHandle,
}: CardioEffortFormProps) {
  const { t } = useTranslation();
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const completed = state === 'done';
  const distanceLabel = distanceUnit === 'miles' ? 'mi' : 'km';

  const setId = set != null ? String(set.id) : null;
  const [minutesDraft, setMinutesDraft] = useState(() => minutesDisplayText(set?.duration));
  const [distanceDraft, setDistanceDraft] = useState(() =>
    distanceDisplayText(set?.distance, distanceUnit),
  );

  // Assumed values render as placeholders only while the field is empty, so
  // the gray value an input shows is exactly what logging the set adopts.
  const assumedMinutesText =
    mode === 'live' && set?.duration == null && assumed?.duration != null
      ? minutesDisplayText(assumed.duration)
      : null;
  const assumedDistanceText =
    mode === 'live' && set?.distance == null && assumed?.distance != null
      ? distanceDisplayText(assumed.distance, distanceUnit)
      : null;
  const [focusedField, setFocusedField] = useState<'duration' | 'distance' | null>(null);

  // Re-seed the drafts when the underlying set's values change externally
  // (autosave echo, unit change) — but never under the open keyboard, where
  // in-progress text is the source of truth.
  const signature = `${set?.duration}|${set?.distance}|${distanceUnit}`;
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    if (focusedField !== 'duration') setMinutesDraft(minutesDisplayText(set?.duration));
    if (focusedField !== 'distance') {
      setDistanceDraft(distanceDisplayText(set?.distance, distanceUnit));
    }
  }

  const commitMinutes = useCallback(
    (text: string) => {
      if (setId == null) return;
      const minutes = parseDecimalInput(text);
      const seconds = Number.isNaN(minutes) ? null : Math.round(minutes * 60);
      if (seconds === (set?.duration ?? null)) return;
      onCommitField?.(setId, { duration: seconds });
    },
    [setId, set?.duration, onCommitField],
  );

  const commitDistance = useCallback(
    (text: string) => {
      if (setId == null) return;
      const value = parseDecimalInput(text);
      // Quantized so the stored km matches what the server echoes back and a
      // miles round-trip can't drift the value on every save.
      const km = Number.isNaN(value)
        ? null
        : Math.round(distanceToKm(value, distanceUnit) * 1000) / 1000;
      if (km === (set?.distance ?? null)) return;
      onCommitField?.(setId, { distance: km });
    },
    [setId, set?.distance, distanceUnit, onCommitField],
  );

  const handleMinutesChange = useCallback(
    (text: string) => {
      setMinutesDraft(text);
      // Edit-mode inputs keep the form reducer current on every keystroke so
      // a header Save that reads it synchronously can never persist stale text.
      if (mode === 'edit') commitMinutes(text);
    },
    [mode, commitMinutes],
  );

  const handleDistanceChange = useCallback(
    (text: string) => {
      setDistanceDraft(text);
      if (mode === 'edit') commitDistance(text);
    },
    [mode, commitDistance],
  );

  const handleToggleComplete = useCallback(() => {
    if (setId == null) return;
    // Commit in-progress drafts first so completing adopts what's on screen.
    commitMinutes(minutesDraft);
    commitDistance(distanceDraft);
    if (completed) onUncomplete?.(setId);
    else onComplete?.(setId);
  }, [
    setId,
    minutesDraft,
    distanceDraft,
    commitMinutes,
    commitDistance,
    completed,
    onComplete,
    onUncomplete,
  ]);

  // Log from the accessory bar: adopt what's on screen, then complete. The
  // bar only offers Log while the set is uncompleted.
  const handleLog = useCallback(() => {
    if (setId == null) return;
    commitMinutes(minutesDraft);
    commitDistance(distanceDraft);
    if (!completed) onComplete?.(setId);
  }, [
    setId,
    minutesDraft,
    distanceDraft,
    commitMinutes,
    commitDistance,
    completed,
    onComplete,
  ]);
  const handleLogRef = useRef(handleLog);
  useEffect(() => {
    handleLogRef.current = handleLog;
  });

  const durationInputRef = useRef<TextInput>(null);
  const distanceInputRef = useRef<TextInput>(null);

  // Register the form's accessory handle (live only) so the screen's sticky
  // keyboard bar can dispatch Next/Log to the focused field, exactly like a
  // set row. `advance` is deliberately inert: the form owns exactly one set,
  // and adding another from the bar would flip the exercise to the fallback
  // set table.
  useEffect(() => {
    if (mode !== 'live' || onRegisterAccessoryHandle == null || setId == null) return;
    const key = renderKey ?? setId;
    onRegisterAccessoryHandle(key, {
      log: () => handleLogRef.current(),
      focusField: (field) => {
        const ref = field === 'distance' ? distanceInputRef : durationInputRef;
        ref.current?.focus();
      },
      advance: () => {},
    });
    return () => onRegisterAccessoryHandle(key, null);
  }, [mode, renderKey, setId, onRegisterAccessoryHandle]);

  if (mode === 'view') {
    return (
      <View
        className="mt-2 px-1 pb-2 flex-row gap-3"
        accessibilityLabel={t('cardioEffort.effort', { defaultValue: '{{name}} effort', name: exerciseName })}
      >
        <View className="flex-1 items-center">
          <Text className="text-center text-xs font-semibold uppercase text-text-muted mb-1">
            {t('cardioEffort.duration', { defaultValue: 'Duration (min)' })}
          </Text>
          <Text
            className="text-center text-sm text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {minutesDisplayText(set?.duration) || '–'}
          </Text>
        </View>
        <View className="flex-1 items-center">
          <Text className="text-center text-xs font-semibold uppercase text-text-muted mb-1">
            {t('cardioEffort.distance', { defaultValue: 'Distance ({{unit}})', unit: distanceLabel })}
          </Text>
          <Text
            className="text-center text-sm text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {distanceDisplayText(set?.distance, distanceUnit) || '–'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="mt-2 px-1 pb-2 flex-row items-end gap-3">
      <View className="flex-1 items-center">
        <Text className="text-center text-xs font-semibold uppercase text-text-muted mb-1">
          {t('cardioEffort.duration', { defaultValue: 'Duration (min)' })}
        </Text>
        <SetCellInput
          inputRef={durationInputRef}
          value={minutesDraft}
          onChangeText={handleMinutesChange}
          onFocus={() => {
            setFocusedField('duration');
            if (mode === 'live' && setId != null) onActivateSet?.(setId, 'duration');
          }}
          onBlur={() => {
            setFocusedField(null);
            commitMinutes(minutesDraft);
          }}
          keyboardType="decimal-pad"
          accessibilityLabel={t('cardioEffort.durationHint', { defaultValue: 'Duration in minutes for {{name}}', name: exerciseName })}
          className="w-16"
          placeholder={assumedMinutesText ?? '–'}
          flat
        />
      </View>
      <View className="flex-1 items-center">
        <Text className="text-center text-xs font-semibold uppercase text-text-muted mb-1">
          {t('cardioEffort.distance', { defaultValue: 'Distance ({{unit}})', unit: distanceLabel })}
        </Text>
        <SetCellInput
          inputRef={distanceInputRef}
          value={distanceDraft}
          onChangeText={handleDistanceChange}
          onFocus={() => {
            setFocusedField('distance');
            if (mode === 'live' && setId != null) onActivateSet?.(setId, 'distance');
          }}
          onBlur={() => {
            setFocusedField(null);
            commitDistance(distanceDraft);
          }}
          keyboardType="decimal-pad"
          accessibilityLabel={t('cardioEffort.distanceHint', { defaultValue: 'Distance in {{unit}} for {{name}}', unit: distanceLabel, name: exerciseName })}
          className="w-16"
          placeholder={assumedDistanceText ?? '–'}
          flat
        />
      </View>
      {mode === 'live' && onComplete != null && (
        <Pressable
          onPress={handleToggleComplete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={
            completed
              ? t('cardioEffort.markIncomplete', { defaultValue: 'Mark {{name}} incomplete', name: exerciseName })
              : t('cardioEffort.complete', { defaultValue: 'Complete {{name}}', name: exerciseName })
          }
          className="pb-1"
        >
          {completed ? (
            <CompletionCheck size={28} testID="cardio-complete-badge" />
          ) : state === 'current' ? (
            <View testID="cardio-log-ring">
              <LogCircle color={accentPrimary} />
            </View>
          ) : (
            <View
              testID="cardio-upcoming-ring"
              className="h-7 w-7 rounded-full border-2 items-center justify-center"
              style={{ borderColor: textMuted }}
            />
          )}
        </Pressable>
      )}
    </View>
  );
}
