// Sole consumer: ActivityDetailScreen (via EditableSetList). The workout and
// preset forms use the card-based ActiveWorkoutSetRow in edit mode.
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  InputAccessoryView,
  Platform,
  type TextInputInstance,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import Icon from './Icon';
import StepperInput from './StepperInput';
import {
  SetInputAccessoryBar,
  SetSwipeDeleteAction,
  useAccessoryEpoch,
} from './SetRowChrome';
import { focusWithAndroidImeRetry } from '../utils/keyboardFocus';
import {
  parseDecimalInput,
  parseSignedDecimalInput,
} from '../utils/numericInput';
import { isDurationModality } from '../utils/workoutSession';
import {
  isBodyweightModality,
  isWeightDistanceModality,
  isWeightDurationModality,
  type ExerciseModality,
} from '@workspace/shared';

type EditableField = 'weight' | 'reps' | 'duration' | 'distance';

interface EditableSetRowProps {
  exerciseClientId: string;
  setClientId: string;
  weight: string;
  reps: string;
  /** Integer seconds as display text; only rendered on duration-modality rows. */
  duration: string;
  /** Distance as display text in the modality's unit (metres/yards for carries). */
  distance?: string;
  /** Label for the distance unit shown beside a carry's distance. */
  distanceUnitLabel?: string;
  setNumber: number;
  isActive: boolean;
  /** The currently-active field for this row. Controls which input is focused
   *  and what the keyboard accessory's "Next" button does. ('rpe' comes from the
   *  shared editing hook but never occurs for activities — it falls through to
   *  the weight input, which is unreachable here.) */
  activeField?: EditableField | 'rpe';
  /** The owning exercise's resolved modality; decides which inputs render. */
  modality?: ExerciseModality;
  weightUnit: string;
  nextSetKey?: string | null;
  onActivateSet: (setKey: string, field: EditableField) => void;
  onDeactivate: () => void;
  onUpdateSetField: (
    exerciseClientId: string,
    setClientId: string,
    field: EditableField,
    value: string
  ) => void;
  onRemoveSet: (exerciseClientId: string, setClientId: string) => void;
  onAddSet: (exerciseClientId: string) => void;
}

function EditableSetRow({
  exerciseClientId,
  setClientId,
  weight,
  reps,
  duration,
  distance = '',
  distanceUnitLabel = '',
  setNumber,
  isActive,
  activeField = 'weight',
  modality = 'weight_reps',
  weightUnit,
  nextSetKey,
  onActivateSet,
  onDeactivate,
  onUpdateSetField,
  onRemoveSet,
  onAddSet,
}: EditableSetRowProps) {
  const { t } = useTranslation();
  const dangerColor = useCSSVariable('--color-bg-danger') as string;

  const durationLike = isDurationModality(modality);
  const repsOnly = modality === 'reps_only';
  const bodyweight = isBodyweightModality(modality);
  const weightDuration = isWeightDurationModality(modality);
  const weightDistance = isWeightDistanceModality(modality);
  // Weight rows whose second input is a time or a distance instead of reps.
  const secondField = weightDuration
    ? ('duration' as const)
    : weightDistance
      ? ('distance' as const)
      : ('reps' as const);
  const firstField = durationLike
    ? ('duration' as const)
    : repsOnly
      ? ('reps' as const)
      : ('weight' as const);

  const setKey = `${exerciseClientId}:${setClientId}`;
  const weightInputRef = useRef<TextInputInstance>(null);
  const repsInputRef = useRef<TextInputInstance>(null);
  const durationInputRef = useRef<TextInputInstance>(null);
  const distanceInputRef = useRef<TextInputInstance>(null);

  const handleActivateWeight = useCallback(() => {
    onActivateSet(setKey, 'weight');
  }, [onActivateSet, setKey]);

  const handleActivateReps = useCallback(() => {
    onActivateSet(setKey, 'reps');
  }, [onActivateSet, setKey]);

  const handleActivateDuration = useCallback(() => {
    onActivateSet(setKey, 'duration');
  }, [onActivateSet, setKey]);

  const handleActivateDistance = useCallback(() => {
    onActivateSet(setKey, 'distance');
  }, [onActivateSet, setKey]);

  // Drive focus from parent-owned state so both initial activation (user taps
  // the display) and within-row advance (Next button moves weight → reps)
  // reliably move the keyboard to the right input.
  useEffect(() => {
    if (!isActive) return;
    const ref =
      activeField === 'reps'
        ? repsInputRef
        : activeField === 'duration'
          ? durationInputRef
          : activeField === 'distance'
            ? distanceInputRef
            : weightInputRef;
    return focusWithAndroidImeRetry(ref);
  }, [isActive, activeField]);

  const handleUpdateWeight = useCallback(
    (value: string) => {
      onUpdateSetField(exerciseClientId, setClientId, 'weight', value);
    },
    [exerciseClientId, onUpdateSetField, setClientId]
  );

  const handleUpdateReps = useCallback(
    (value: string) => {
      onUpdateSetField(exerciseClientId, setClientId, 'reps', value);
    },
    [exerciseClientId, onUpdateSetField, setClientId]
  );

  const handleUpdateDuration = useCallback(
    (value: string) => {
      onUpdateSetField(exerciseClientId, setClientId, 'duration', value);
    },
    [exerciseClientId, onUpdateSetField, setClientId]
  );

  const handleUpdateDistance = useCallback(
    (value: string) => {
      onUpdateSetField(exerciseClientId, setClientId, 'distance', value);
    },
    [exerciseClientId, onUpdateSetField, setClientId]
  );

  const handleStepWeight = useCallback(
    (direction: number) => {
      const current =
        (bodyweight
          ? parseSignedDecimalInput(weight)
          : parseDecimalInput(weight)) || 0;
      // A bodyweight set steps below zero into assistance.
      const next = bodyweight
        ? current + direction * 5
        : Math.max(0, current + direction * 5);
      handleUpdateWeight(String(next));
    },
    [weight, bodyweight, handleUpdateWeight]
  );

  const handleStepReps = useCallback(
    (direction: number) => {
      const current = parseInt(reps, 10) || 0;
      const next = Math.max(0, current + direction);
      handleUpdateReps(String(next));
    },
    [reps, handleUpdateReps]
  );

  const handleStepDuration = useCallback(
    (direction: number) => {
      const current = parseInt(duration, 10) || 0;
      const next = Math.max(0, current + direction * 5);
      handleUpdateDuration(String(next));
    },
    [duration, handleUpdateDuration]
  );

  const handleStepDistance = useCallback(
    (direction: number) => {
      const current = parseDecimalInput(distance) || 0;
      handleUpdateDistance(String(Math.max(0, current + direction * 5)));
    },
    [distance, handleUpdateDistance]
  );

  const handleRemove = useCallback(() => {
    onRemoveSet(exerciseClientId, setClientId);
  }, [exerciseClientId, onRemoveSet, setClientId]);

  const handleConfirmRemove = useCallback(() => {
    Alert.alert(
      t('editableSet.removeTitle', {
        defaultValue: 'Set {{number}}',
        number: setNumber,
      }),
      undefined,
      [
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: handleRemove,
        },
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
      ]
    );
  }, [handleRemove, setNumber, t]);

  const handleAdvance = useCallback(() => {
    // For within-row advance, move focus directly via ref so iOS keeps the
    // keyboard + InputAccessoryView attached. Going through parent state
    // would briefly leave no TextInput focused, which drops the accessory.
    // Single-input rows (duration, reps-only) have no within-row hop.
    if (!durationLike && !repsOnly && activeField === 'weight') {
      const ref =
        secondField === 'duration'
          ? durationInputRef
          : secondField === 'distance'
            ? distanceInputRef
            : repsInputRef;
      ref.current?.focus();
      return;
    }
    if (nextSetKey) {
      onActivateSet(nextSetKey, firstField);
      return;
    }
    onAddSet(exerciseClientId);
  }, [
    activeField,
    durationLike,
    repsOnly,
    secondField,
    firstField,
    exerciseClientId,
    nextSetKey,
    onActivateSet,
    onAddSet,
  ]);

  const advanceLabel =
    !durationLike && !repsOnly && activeField === 'weight'
      ? 'Next'
      : 'Next Set';

  // The epoch keeps a remounted input from reusing a prior activation's id,
  // which iOS view recycling would treat as unchanged (see useAccessoryEpoch).
  const accessoryEpoch = useAccessoryEpoch(isActive);
  const accessoryId = `set-${setClientId}-${accessoryEpoch}`;
  const weightInputProps = useMemo(
    () => ({
      onFocus: handleActivateWeight,
      ...(Platform.OS === 'ios' && { inputAccessoryViewID: accessoryId }),
    }),
    [accessoryId, handleActivateWeight]
  );
  const repsInputProps = useMemo(
    () => ({
      onFocus: handleActivateReps,
      ...(Platform.OS === 'ios' && { inputAccessoryViewID: accessoryId }),
    }),
    [accessoryId, handleActivateReps]
  );
  const distanceInputProps = useMemo(
    () => ({
      onFocus: handleActivateDistance,
      ...(Platform.OS === 'ios' && { inputAccessoryViewID: accessoryId }),
    }),
    [accessoryId, handleActivateDistance]
  );
  const durationInputProps = useMemo(
    () => ({
      onFocus: handleActivateDuration,
      ...(Platform.OS === 'ios' && { inputAccessoryViewID: accessoryId }),
    }),
    [accessoryId, handleActivateDuration]
  );

  if (isActive) {
    return (
      <>
        <View className="flex-row items-center py-3">
          <Text className="text-base text-text-muted w-10 text-center">
            {setNumber}
          </Text>
          {durationLike ? (
            <View className="flex-1 items-center">
              <StepperInput
                compact
                value={duration}
                onChangeText={handleUpdateDuration}
                onIncrement={() => handleStepDuration(1)}
                onDecrement={() => handleStepDuration(-1)}
                keyboardType="number-pad"
                inputRef={durationInputRef}
                inputProps={durationInputProps}
              />
            </View>
          ) : (
            <>
              {!repsOnly && (
                <View className="flex-1 items-center">
                  <StepperInput
                    compact
                    value={weight}
                    onChangeText={handleUpdateWeight}
                    onIncrement={() => handleStepWeight(1)}
                    onDecrement={() => handleStepWeight(-1)}
                    keyboardType={
                      !bodyweight
                        ? 'decimal-pad'
                        : Platform.OS === 'ios'
                          ? 'numbers-and-punctuation'
                          : 'numeric'
                    }
                    inputRef={weightInputRef}
                    inputProps={weightInputProps}
                  />
                </View>
              )}
              <View className="flex-1 items-center">
                {weightDuration ? (
                  <StepperInput
                    compact
                    value={duration}
                    onChangeText={handleUpdateDuration}
                    onIncrement={() => handleStepDuration(1)}
                    onDecrement={() => handleStepDuration(-1)}
                    keyboardType="number-pad"
                    inputRef={durationInputRef}
                    inputProps={durationInputProps}
                  />
                ) : weightDistance ? (
                  <StepperInput
                    compact
                    value={distance}
                    onChangeText={handleUpdateDistance}
                    onIncrement={() => handleStepDistance(1)}
                    onDecrement={() => handleStepDistance(-1)}
                    keyboardType="decimal-pad"
                    inputRef={distanceInputRef}
                    inputProps={distanceInputProps}
                  />
                ) : (
                  <StepperInput
                    compact
                    value={reps}
                    onChangeText={handleUpdateReps}
                    onIncrement={() => handleStepReps(1)}
                    onDecrement={() => handleStepReps(-1)}
                    keyboardType="number-pad"
                    inputRef={repsInputRef}
                    inputProps={repsInputProps}
                  />
                )}
              </View>
            </>
          )}
          <Button
            variant="ghost"
            onPress={handleRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="py-0 px-0"
          >
            <Icon name="remove-circle" size={18} color={dangerColor} />
          </Button>
        </View>
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={accessoryId}>
            <SetInputAccessoryBar
              onDone={onDeactivate}
              actions={[
                { key: 'advance', label: advanceLabel, onPress: handleAdvance },
              ]}
            />
          </InputAccessoryView>
        )}
      </>
    );
  }

  // A bodyweight set's weight is a change to body weight, so it shows its sign.
  const signedWeight =
    bodyweight && parseSignedDecimalInput(weight) > 0 && !weight.startsWith('+')
      ? `+${weight}`
      : weight;
  const displayWeight = weight ? `${signedWeight} ${weightUnit}` : '\u2013';
  const displayReps = reps || '\u2013';
  const displayDuration = duration || '\u2013';
  const displayDistance = distance
    ? `${distance} ${distanceUnitLabel}`.trim()
    : '\u2013';
  const displaySecond = weightDuration
    ? displayDuration
    : weightDistance
      ? displayDistance
      : displayReps;
  const activateSecond = weightDuration
    ? handleActivateDuration
    : weightDistance
      ? handleActivateDistance
      : handleActivateReps;

  return (
    <ReanimatedSwipeable
      renderRightActions={() => <SetSwipeDeleteAction onPress={handleRemove} />}
      overshootRight={false}
      rightThreshold={40}
    >
      <View className="flex-row items-center py-3 bg-background">
        <Text className="text-base text-text-muted w-10 text-center">
          {setNumber}
        </Text>
        {durationLike ? (
          <TouchableOpacity
            className="flex-1 py-1"
            onPress={handleActivateDuration}
            onLongPress={handleConfirmRemove}
            activeOpacity={0.6}
          >
            <Text className="text-base text-text-primary text-center">
              {displayDuration}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            {!repsOnly && (
              <TouchableOpacity
                className="flex-1 py-1"
                onPress={handleActivateWeight}
                onLongPress={handleConfirmRemove}
                activeOpacity={0.6}
              >
                <Text className="text-base text-text-primary text-center">
                  {displayWeight}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              className="flex-1 py-1"
              onPress={activateSecond}
              onLongPress={handleConfirmRemove}
              activeOpacity={0.6}
            >
              <Text className="text-base text-text-primary text-center">
                {displaySecond}
              </Text>
            </TouchableOpacity>
          </>
        )}
        {/* Reserve space for the remove button so rows don't shift when activated */}
        <View style={{ width: 18 }} />
      </View>
    </ReanimatedSwipeable>
  );
}

export default React.memo(EditableSetRow);
