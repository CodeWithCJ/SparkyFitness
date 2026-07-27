import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import FormInput from './FormInput';
import CompletionCheck from './CompletionCheck';
import { distanceFromKm, distanceToKm } from '../utils/unitConversions';
import { parseDecimalInput } from '../utils/numericInput';
import { formatDurationSeconds, type WorkoutCardSet } from '../utils/workoutSession';
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
  /** Live only: the set's completion state (drives the log affordance). */
  completed?: boolean;
  /**
   * Commit a duration (seconds) or distance (km) patch for the set. Live
   * commits to the store; the form lists convert back to draft text.
   */
  onCommitField?: (setId: string, patch: ActiveSetPatch) => void;
  /** Live only: the completion affordance, so the workout cursor advances. */
  onComplete?: (setId: string) => void;
  onUncomplete?: (setId: string) => void;
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
  completed = false,
  onCommitField,
  onComplete,
  onUncomplete,
}: CardioEffortFormProps) {
  const successColor = String(useCSSVariable('--color-icon-success'));
  const distanceLabel = distanceUnit === 'miles' ? 'mi' : 'km';

  const setId = set != null ? String(set.id) : null;
  const [minutesDraft, setMinutesDraft] = useState(() => minutesDisplayText(set?.duration));
  const [distanceDraft, setDistanceDraft] = useState(() =>
    distanceDisplayText(set?.distance, distanceUnit),
  );
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

  if (mode === 'view') {
    const parts: string[] = [];
    if (set?.duration != null) parts.push(formatDurationSeconds(set.duration));
    if (set?.distance != null) {
      parts.push(
        `${parseFloat(distanceFromKm(set.distance, distanceUnit).toFixed(2))} ${distanceLabel}`,
      );
    }
    return (
      <View className="mt-2 px-1 pb-2">
        <Text
          className="text-base text-text-primary"
          style={{ fontVariant: ['tabular-nums'] }}
          accessibilityLabel={`${exerciseName} effort`}
        >
          {parts.length > 0 ? parts.join(' · ') : 'No duration recorded'}
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-2 px-1 pb-2 flex-row items-end gap-3">
      <View className="flex-1">
        <Text className="text-xs font-semibold uppercase text-text-muted mb-1">
          Duration (min)
        </Text>
        <FormInput
          value={minutesDraft}
          onChangeText={handleMinutesChange}
          onFocus={() => setFocusedField('duration')}
          onBlur={() => {
            setFocusedField(null);
            commitMinutes(minutesDraft);
          }}
          keyboardType="decimal-pad"
          placeholder="–"
          accessibilityLabel={`Duration in minutes for ${exerciseName}`}
        />
      </View>
      <View className="flex-1">
        <Text className="text-xs font-semibold uppercase text-text-muted mb-1">
          Distance ({distanceLabel})
        </Text>
        <FormInput
          value={distanceDraft}
          onChangeText={handleDistanceChange}
          onFocus={() => setFocusedField('distance')}
          onBlur={() => {
            setFocusedField(null);
            commitDistance(distanceDraft);
          }}
          keyboardType="decimal-pad"
          placeholder="–"
          accessibilityLabel={`Distance in ${distanceLabel} for ${exerciseName}`}
        />
      </View>
      {mode === 'live' && onComplete != null && (
        <Pressable
          onPress={handleToggleComplete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={
            completed ? `Mark ${exerciseName} incomplete` : `Complete ${exerciseName}`
          }
          className="pb-1"
        >
          {completed ? (
            <CompletionCheck size={36} testID="cardio-complete-badge" />
          ) : (
            <View
              className="items-center justify-center rounded-full"
              style={{
                width: 36,
                height: 36,
                borderWidth: 2,
                borderColor: successColor,
              }}
            />
          )}
        </Pressable>
      )}
    </View>
  );
}
