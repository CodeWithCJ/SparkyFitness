import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, InputAccessoryView, Platform } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import Icon from './Icon';
import StepperInput from './StepperInput';
import { parseDecimalInput } from '../utils/numericInput';

interface EditableSetRowProps {
  exerciseClientId: string;
  setClientId: string;
  weight: string;
  reps: string;
  setNumber: number;
  isActive: boolean;
  /** Which field to auto-focus when entering active mode. Defaults to 'weight'. */
  initialFocusField?: 'weight' | 'reps';
  weightUnit: string;
  nextSetKey?: string | null;
  onActivateSet: (setKey: string, field: 'weight' | 'reps') => void;
  onDeactivate: () => void;
  onUpdateSetField: (exerciseClientId: string, setClientId: string, field: 'weight' | 'reps', value: string) => void;
  onRemoveSet: (exerciseClientId: string, setClientId: string) => void;
  onAddSet: (exerciseClientId: string) => void;
  /** Whether this is the last set in the exercise. Controls the accessory button label. */
  isLastSet?: boolean;
}

function EditableSetRow({
  exerciseClientId,
  setClientId,
  weight,
  reps,
  setNumber,
  isActive,
  weightUnit,
  nextSetKey,
  onActivateSet,
  onDeactivate,
  onUpdateSetField,
  onRemoveSet,
  onAddSet,
  isLastSet,
}: EditableSetRowProps) {
  const [dangerColor, accentPrimary, chromeBg, chromeBorder] = useCSSVariable([
    '--color-bg-danger',
    '--color-accent-primary',
    '--color-chrome',
    '--color-chrome-border',
  ]) as [string, string, string, string];

  const setKey = `${exerciseClientId}:${setClientId}`;

  const handleActivateWeight = useCallback(() => {
    onActivateSet(setKey, 'weight');
  }, [onActivateSet, setKey]);

  const handleActivateReps = useCallback(() => {
    onActivateSet(setKey, 'reps');
  }, [onActivateSet, setKey]);

  const handleUpdateWeight = useCallback((value: string) => {
    onUpdateSetField(exerciseClientId, setClientId, 'weight', value);
  }, [exerciseClientId, onUpdateSetField, setClientId]);

  const handleUpdateReps = useCallback((value: string) => {
    onUpdateSetField(exerciseClientId, setClientId, 'reps', value);
  }, [exerciseClientId, onUpdateSetField, setClientId]);

  const handleStepWeight = useCallback((direction: number) => {
    const current = parseDecimalInput(weight) || 0;
    const next = Math.max(0, current + direction * 5);
    handleUpdateWeight(String(next));
  }, [weight, handleUpdateWeight]);

  const handleStepReps = useCallback((direction: number) => {
    const current = parseInt(reps, 10) || 0;
    const next = Math.max(0, current + direction);
    handleUpdateReps(String(next));
  }, [reps, handleUpdateReps]);

  const handleRemove = useCallback(() => {
    onRemoveSet(exerciseClientId, setClientId);
  }, [exerciseClientId, onRemoveSet, setClientId]);

  const handleAdvance = useCallback(() => {
    if (nextSetKey) {
      onActivateSet(nextSetKey, 'weight');
      return;
    }
    onAddSet(exerciseClientId);
  }, [exerciseClientId, nextSetKey, onActivateSet, onAddSet]);

  if (isActive) {
    const accessoryId = `set-${setClientId}`;

    return (
      <>
        <View className="flex-row items-center py-3">
          <Text className="text-base text-text-muted w-10 text-center">{setNumber}</Text>
          <View className="flex-1 items-center">
            <StepperInput
              compact
              value={weight}
              onChangeText={handleUpdateWeight}
              onIncrement={() => handleStepWeight(1)}
              onDecrement={() => handleStepWeight(-1)}
              keyboardType="decimal-pad"
              inputProps={{
                ...(Platform.OS === 'ios' && { inputAccessoryViewID: accessoryId }),
              }}
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
              inputProps={{
                ...(Platform.OS === 'ios' && { inputAccessoryViewID: accessoryId }),
              }}
            />
          </View>
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
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 8,
                backgroundColor: chromeBg,
                borderTopWidth: 1,
                borderTopColor: chromeBorder,
              }}
            >
              <TouchableOpacity onPress={onDeactivate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: accentPrimary, fontWeight: '600', fontSize: 16 }}>
                  Done
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdvance} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: accentPrimary, fontWeight: '600', fontSize: 16 }}>
                  {isLastSet ? 'Next Set' : 'Next'}
                </Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        )}
      </>
    );
  }

  const displayWeight = weight ? `${weight} ${weightUnit}` : '\u2014';
  const displayReps = reps || '\u2014';

  return (
    <ReanimatedSwipeable
      renderRightActions={() => (
        <TouchableOpacity
          className="bg-bg-danger justify-center items-center"
          style={{ width: 72 }}
          onPress={handleRemove}
          activeOpacity={0.7}
        >
          <Text className="text-text-danger font-semibold text-sm">Delete</Text>
        </TouchableOpacity>
      )}
      overshootRight={false}
      rightThreshold={40}
    >
      <View className="flex-row items-center py-3 bg-background">
        <Text className="text-base text-text-muted w-10 text-center">{setNumber}</Text>
        <TouchableOpacity
          className="flex-1 py-1"
          onPress={handleActivateWeight}
          activeOpacity={0.6}
        >
          <Text className="text-base text-text-primary text-center">{displayWeight}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 py-1"
          onPress={handleActivateReps}
          activeOpacity={0.6}
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
