// Sole consumer: ActivityDetailScreen (via EditableSetList). The workout and
// preset forms use the card-based ActiveWorkoutSetRow in edit mode.
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, View, Text, TextInput, TouchableOpacity, InputAccessoryView, Platform } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import Icon from './Icon';
import StepperInput from './StepperInput';
import { SetInputAccessoryBar, SetSwipeDeleteAction } from './SetRowChrome';
import { parseDecimalInput } from '../utils/numericInput';
import {
  formatMobileNumber,
  isMobileRtl,
  localizeServingUnit,
  mobileT,
} from '../localization';

interface EditableSetRowProps {
  exerciseClientId: string;
  setClientId: string;
  weight: string;
  reps: string;
  setNumber: number;
  isActive: boolean;
  /** The currently-active field for this row. Controls which input is focused
   *  and what the keyboard accessory's "Next" button does. ('rpe' comes from the
   *  shared editing hook but never occurs for activities — it falls through to
   *  the weight input, which is unreachable here.) */
  activeField?: 'weight' | 'reps' | 'rpe';
  weightUnit: string;
  nextSetKey?: string | null;
  onActivateSet: (setKey: string, field: 'weight' | 'reps') => void;
  onDeactivate: () => void;
  onUpdateSetField: (exerciseClientId: string, setClientId: string, field: 'weight' | 'reps', value: string) => void;
  onRemoveSet: (exerciseClientId: string, setClientId: string) => void;
  onAddSet: (exerciseClientId: string) => void;
}

function EditableSetRow({
  exerciseClientId,
  setClientId,
  weight,
  reps,
  setNumber,
  isActive,
  activeField = 'weight',
  weightUnit,
  nextSetKey,
  onActivateSet,
  onDeactivate,
  onUpdateSetField,
  onRemoveSet,
  onAddSet,
}: EditableSetRowProps) {
  const dangerColor = useCSSVariable('--color-bg-danger') as string;

  const setKey = `${exerciseClientId}:${setClientId}`;
  const weightInputRef = useRef<TextInput>(null);
  const repsInputRef = useRef<TextInput>(null);

  const handleActivateWeight = useCallback(() => {
    onActivateSet(setKey, 'weight');
  }, [onActivateSet, setKey]);

  const handleActivateReps = useCallback(() => {
    onActivateSet(setKey, 'reps');
  }, [onActivateSet, setKey]);

  // Drive focus from parent-owned state so both initial activation (user taps
  // the display) and within-row advance (Next button moves weight → reps)
  // reliably move the keyboard to the right input.
  useEffect(() => {
    if (!isActive) return;
    const ref = activeField === 'reps' ? repsInputRef : weightInputRef;
    ref.current?.focus();
  }, [isActive, activeField]);

  const handleUpdateWeight = useCallback((value: string) => {
    onUpdateSetField(exerciseClientId, setClientId, 'weight', value);
  }, [exerciseClientId, onUpdateSetField, setClientId]);

  const handleUpdateReps = useCallback((value: string) => {
    onUpdateSetField(exerciseClientId, setClientId, 'reps', value);
  }, [exerciseClientId, onUpdateSetField, setClientId]);

  const handleStepWeight = useCallback((direction: number) => {
    const current = parseDecimalInput(weight) || 0;
    const next = Math.max(0, current + direction * 5);
    handleUpdateWeight(formatMobileNumber(next, {
      maximumFractionDigits: 2,
      useGrouping: false,
    }));
  }, [weight, handleUpdateWeight]);

  const handleStepReps = useCallback((direction: number) => {
    const current = Math.trunc(parseDecimalInput(reps)) || 0;
    const next = Math.max(0, current + direction);
    handleUpdateReps(formatMobileNumber(next, {
      maximumFractionDigits: 0,
      useGrouping: false,
    }));
  }, [reps, handleUpdateReps]);

  const handleRemove = useCallback(() => {
    onRemoveSet(exerciseClientId, setClientId);
  }, [exerciseClientId, onRemoveSet, setClientId]);

  const handleConfirmRemove = useCallback(() => {
    const localizedSetNumber = formatMobileNumber(setNumber, { maximumFractionDigits: 0 });
    Alert.alert(mobileT('activityDetail.setNumber', { set: localizedSetNumber }), undefined, [
      { text: mobileT('common.delete'), style: 'destructive', onPress: handleRemove },
      { text: mobileT('common.cancel'), style: 'cancel' },
    ]);
  }, [handleRemove, setNumber]);

  const handleAdvance = useCallback(() => {
    // For within-row advance, move focus directly via ref so iOS keeps the
    // keyboard + InputAccessoryView attached. Going through parent state
    // would briefly leave no TextInput focused, which drops the accessory.
    if (activeField === 'weight') {
      repsInputRef.current?.focus();
      return;
    }
    if (nextSetKey) {
      onActivateSet(nextSetKey, 'weight');
      return;
    }
    onAddSet(exerciseClientId);
  }, [activeField, exerciseClientId, nextSetKey, onActivateSet, onAddSet]);

  const advanceLabel = activeField === 'weight'
    ? mobileT('workoutSet.next')
    : mobileT('workoutSet.nextSet');
  const localizedSetNumber = formatMobileNumber(setNumber, { maximumFractionDigits: 0 });
  const editWeightLabel = mobileT('workoutSet.editWeight', { set: localizedSetNumber });
  const editRepsLabel = mobileT('workoutSet.editReps', { set: localizedSetNumber });
  const deleteSetLabel = mobileT('workoutSet.delete', { set: localizedSetNumber });

  const accessoryId = `set-${setClientId}`;
  const weightInputProps = useMemo(
    () => ({
      onFocus: handleActivateWeight,
      ...(Platform.OS === 'ios' && { inputAccessoryViewID: accessoryId }),
    }),
    [accessoryId, handleActivateWeight],
  );
  const repsInputProps = useMemo(
    () => ({
      onFocus: handleActivateReps,
      ...(Platform.OS === 'ios' && { inputAccessoryViewID: accessoryId }),
    }),
    [accessoryId, handleActivateReps],
  );

  if (isActive) {
    return (
      <>
        <View className="flex-row items-center py-3">
          <Text className="text-base text-text-muted w-10 text-center">
            {localizedSetNumber}
          </Text>
          <View className="flex-1 items-center">
            <StepperInput
              compact
              value={weight}
              onChangeText={handleUpdateWeight}
              onIncrement={() => handleStepWeight(1)}
              onDecrement={() => handleStepWeight(-1)}
              keyboardType="decimal-pad"
              placeholder={formatMobileNumber(0)}
              inputRef={weightInputRef}
              inputProps={weightInputProps}
              inputAccessibilityLabel={editWeightLabel}
            />
          </View>
          <View className="flex-1 items-center">
            <StepperInput
              compact
              value={reps}
              onChangeText={handleUpdateReps}
              onIncrement={() => handleStepReps(1)}
              onDecrement={() => handleStepReps(-1)}
              keyboardType="number-pad"
              placeholder={formatMobileNumber(0)}
              inputRef={repsInputRef}
              inputProps={repsInputProps}
              inputAccessibilityLabel={editRepsLabel}
            />
          </View>
          <Button
            variant="ghost"
            onPress={handleRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="py-0 px-0"
            accessibilityLabel={deleteSetLabel}
          >
            <Icon name="remove-circle" size={18} color={dangerColor} />
          </Button>
        </View>
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={accessoryId}>
            <SetInputAccessoryBar
              onDone={onDeactivate}
              actions={[{ key: 'advance', label: advanceLabel, onPress: handleAdvance }]}
            />
          </InputAccessoryView>
        )}
      </>
    );
  }

  const numericWeight = parseDecimalInput(weight);
  const numericReps = parseDecimalInput(reps);
  const displayWeight = Number.isFinite(numericWeight)
    ? `${formatMobileNumber(numericWeight, { maximumFractionDigits: 2 })} ${localizeServingUnit(weightUnit)}`
    : '\u2013';
  const displayReps = Number.isFinite(numericReps)
    ? formatMobileNumber(Math.trunc(numericReps), { maximumFractionDigits: 0 })
    : '\u2013';

  return (
    <ReanimatedSwipeable
      renderLeftActions={isMobileRtl
        ? () => <SetSwipeDeleteAction onPress={handleRemove} />
        : undefined}
      renderRightActions={!isMobileRtl
        ? () => <SetSwipeDeleteAction onPress={handleRemove} />
        : undefined}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={isMobileRtl ? 40 : undefined}
      rightThreshold={!isMobileRtl ? 40 : undefined}
    >
      <View className="flex-row items-center py-3 bg-background">
        <Text className="text-base text-text-muted w-10 text-center">
          {localizedSetNumber}
        </Text>
        <TouchableOpacity
          className="flex-1 py-1"
          onPress={handleActivateWeight}
          onLongPress={handleConfirmRemove}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={editWeightLabel}
        >
          <Text className="text-base text-text-primary text-center">{displayWeight}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 py-1"
          onPress={handleActivateReps}
          onLongPress={handleConfirmRemove}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={editRepsLabel}
        >
          <Text className="text-base text-text-primary text-center">{displayReps}</Text>
        </TouchableOpacity>
        {/* Reserve space for the remove button so rows don't shift when activated */}
        <View style={{ width: 18 }} />
      </View>
    </ReanimatedSwipeable>
  );
}

export default React.memo(EditableSetRow);
