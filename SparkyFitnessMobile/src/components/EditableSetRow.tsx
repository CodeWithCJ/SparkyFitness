import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useCSSVariable } from 'uniwind';
import FormInput from './FormInput';
import Button from './ui/Button';
import Icon from './Icon';
import type { WorkoutDraftSet } from '../types/drafts';

interface EditableSetRowProps {
  set: WorkoutDraftSet;
  setNumber: number;
  isActive: boolean;
  /** Which field to auto-focus when entering active mode. Defaults to 'weight'. */
  initialFocusField?: 'weight' | 'reps';
  weightUnit: string;
  onActivate: (field?: 'weight' | 'reps') => void;
  onDeactivate: () => void;
  onUpdateField: (field: 'weight' | 'reps', value: string) => void;
  onRemove: () => void;
  /** Called instead of onDeactivate when the user submits the reps field. Use to auto-add the next set. */
  onAdvance?: () => void;
}

export default function EditableSetRow({
  set,
  setNumber,
  isActive,
  initialFocusField = 'weight',
  weightUnit,
  onActivate,
  onDeactivate,
  onUpdateField,
  onRemove,
  onAdvance,
}: EditableSetRowProps) {
  const repsInputRef = useRef<TextInput>(null);
  const [dangerColor, accentPrimary] = useCSSVariable(['--color-bg-danger', '--color-accent-primary']) as [string, string];

  const [focusedField, setFocusedField] = useState<'weight' | 'reps' | null>(initialFocusField);

  if (isActive) {
    return (
      <View className="flex-row items-center py-3">
        <Text className="text-base text-text-muted w-10 text-center">{setNumber}</Text>
        <View className="flex-1 items-center">
          <FormInput
            style={[
              { width: 100, textAlign: 'center', paddingTop: 8, paddingBottom: 8, paddingLeft: 8, paddingRight: 8, fontSize: 16 },
              focusedField === 'weight' && { borderColor: accentPrimary, borderWidth: 1.5 },
            ]}
            value={set.weight}
            onChangeText={(v: string) => onUpdateField('weight', v)}
            placeholder="0"
            keyboardType="decimal-pad"
            returnKeyType="next"
            autoFocus={initialFocusField === 'weight'}
            onFocus={() => setFocusedField('weight')}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={() => repsInputRef.current?.focus()}
          />
        </View>
        <View className="flex-1 items-center">
          <FormInput
            ref={repsInputRef}
            style={[
              { width: 80, textAlign: 'center', paddingTop: 8, paddingBottom: 8, paddingLeft: 8, paddingRight: 8, fontSize: 16 },
              focusedField === 'reps' && { borderColor: accentPrimary, borderWidth: 1.5 },
            ]}
            value={set.reps}
            onChangeText={(v: string) => onUpdateField('reps', v)}
            placeholder="0"
            keyboardType="number-pad"
            returnKeyType="done"
            autoFocus={initialFocusField === 'reps'}
            onFocus={() => setFocusedField('reps')}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={onAdvance ?? onDeactivate}
          />
        </View>
        <Button
          variant="ghost"
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="py-0 px-0"
        >
          <Icon name="remove-circle" size={18} color={dangerColor} />
        </Button>
      </View>
    );
  }

  const displayWeight = set.weight ? `${set.weight} ${weightUnit}` : '\u2014';
  const displayReps = set.reps || '\u2014';

  return (
    <ReanimatedSwipeable
      renderRightActions={() => (
        <TouchableOpacity
          className="bg-bg-danger justify-center items-center"
          style={{ width: 72 }}
          onPress={onRemove}
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
          onPress={() => onActivate('weight')}
          activeOpacity={0.6}
        >
          <Text className="text-base text-text-primary text-center">{displayWeight}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 py-1"
          onPress={() => onActivate('reps')}
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
