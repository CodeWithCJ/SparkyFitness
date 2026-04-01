import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, InputAccessoryView, Platform } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useCSSVariable } from 'uniwind';
import FormInput from './FormInput';
import Button from './ui/Button';
import Icon from './Icon';

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
  initialFocusField = 'weight',
  weightUnit,
  nextSetKey,
  onActivateSet,
  onDeactivate,
  onUpdateSetField,
  onRemoveSet,
  onAddSet,
  isLastSet,
}: EditableSetRowProps) {
  const repsInputRef = useRef<TextInput>(null);
  const [dangerColor, accentPrimary, chromeBg, chromeBorder] = useCSSVariable([
    '--color-bg-danger',
    '--color-accent-primary',
    '--color-chrome',
    '--color-chrome-border',
  ]) as [string, string, string, string];

  const [focusedField, setFocusedField] = useState<'weight' | 'reps' | null>(initialFocusField);
  const setKey = `${exerciseClientId}:${setClientId}`;

  useEffect(() => {
    if (isActive) {
      setFocusedField(initialFocusField);
    }
  }, [initialFocusField, isActive]);

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
    const weightAccessoryId = `set-weight-${setClientId}`;
    const repsAccessoryId = `set-reps-${setClientId}`;
    const renderAccessory = (nativeID: string, actionLabel: string | null, onAction?: () => void) => (
      <InputAccessoryView nativeID={nativeID}>
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
          {actionLabel && onAction && (
            <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: accentPrimary, fontWeight: '600', fontSize: 16 }}>
                {actionLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </InputAccessoryView>
    );

    return (
      <>
        <View className="flex-row items-center py-3">
          <Text className="text-base text-text-muted w-10 text-center">{setNumber}</Text>
          <View className="flex-1 items-center">
            <FormInput
              style={[
                { width: 100, textAlign: 'center', paddingTop: 8, paddingBottom: 8, paddingLeft: 8, paddingRight: 8, fontSize: 16 },
                focusedField === 'weight' && { borderColor: accentPrimary, borderWidth: 1.5 },
              ]}
              value={weight}
              onChangeText={handleUpdateWeight}
              placeholder="0"
              keyboardType="decimal-pad"
              returnKeyType="next"
              autoFocus={initialFocusField === 'weight'}
              selectTextOnFocus
              onFocus={() => setFocusedField('weight')}
              onBlur={() => setFocusedField(null)}
              onSubmitEditing={() => repsInputRef.current?.focus()}
              {...(Platform.OS === 'ios' && { inputAccessoryViewID: weightAccessoryId })}
            />
          </View>
          <View className="flex-1 items-center">
            <FormInput
              ref={repsInputRef}
              style={[
                { width: 80, textAlign: 'center', paddingTop: 8, paddingBottom: 8, paddingLeft: 8, paddingRight: 8, fontSize: 16 },
                focusedField === 'reps' && { borderColor: accentPrimary, borderWidth: 1.5 },
              ]}
              value={reps}
              onChangeText={handleUpdateReps}
              placeholder="0"
              keyboardType="number-pad"
              returnKeyType="done"
              autoFocus={initialFocusField === 'reps'}
              onFocus={() => setFocusedField('reps')}
              onBlur={() => setFocusedField(null)}
              onSubmitEditing={handleAdvance}
              {...(Platform.OS === 'ios' && { inputAccessoryViewID: repsAccessoryId })}
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
          <>
            {renderAccessory(weightAccessoryId, 'Next', () => repsInputRef.current?.focus())}
            {renderAccessory(repsAccessoryId, isLastSet ? 'Next Set' : 'Next', handleAdvance)}
          </>
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
