import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import EditableSetRow from './EditableSetRow';
import type { WorkoutDraftSet } from '../types/drafts';

interface EditableSetListProps {
  exerciseClientId: string;
  sets: WorkoutDraftSet[];
  activeSetKey: string | null;
  activeSetField: 'weight' | 'reps';
  weightUnit: string;
  onActivateSet: (setKey: string, field: 'weight' | 'reps') => void;
  onDeactivateSet: () => void;
  onUpdateSetField: (exerciseClientId: string, setClientId: string, field: 'weight' | 'reps', value: string) => void;
  onRemoveSet: (exerciseClientId: string, setClientId: string) => void;
  onAddSet: (exerciseClientId: string) => void;
}

function EditableSetList({
  exerciseClientId,
  sets,
  activeSetKey,
  activeSetField,
  weightUnit,
  onActivateSet,
  onDeactivateSet,
  onUpdateSetField,
  onRemoveSet,
  onAddSet,
}: EditableSetListProps) {
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [string];

  return (
    <>
      {sets.length > 0 && (
        <Animated.View className="mt-2" layout={LinearTransition.duration(300)}>
          <View className="flex-row items-center py-1 mb-1">
            <Text className="text-xs font-semibold text-text-muted w-10 text-center">Set</Text>
            <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Weight</Text>
            <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Reps</Text>
            <View style={{ width: 18 }} />
          </View>
          {sets.map((set, index) => {
            const setKey = `${exerciseClientId}:${set.clientId}`;
            const isLastSet = index === sets.length - 1;
            const nextSet = sets[index + 1];
            return (
              <Animated.View
                key={set.clientId}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                layout={LinearTransition.duration(300)}
              >
                <EditableSetRow
                  exerciseClientId={exerciseClientId}
                  setClientId={set.clientId}
                  weight={set.weight}
                  reps={set.reps}
                  setNumber={index + 1}
                  isActive={activeSetKey === setKey}
                  initialFocusField={activeSetKey === setKey ? activeSetField : undefined}
                  weightUnit={weightUnit}
                  nextSetKey={nextSet ? `${exerciseClientId}:${nextSet.clientId}` : null}
                  onActivateSet={onActivateSet}
                  onDeactivate={onDeactivateSet}
                  onUpdateSetField={onUpdateSetField}
                  onRemoveSet={onRemoveSet}
                  onAddSet={onAddSet}
                  isLastSet={isLastSet}
                />
              </Animated.View>
            );
          })}
        </Animated.View>
      )}

      <TouchableOpacity
        className="flex-row items-center justify-center py-3"
        onPress={() => onAddSet(exerciseClientId)}
        activeOpacity={0.6}
      >
        <Icon name="add" size={18} color={accentPrimary} />
        <Text className="text-base font-medium ml-1" style={{ color: accentPrimary }}>
          Add Set
        </Text>
      </TouchableOpacity>
    </>
  );
}

export default React.memo(EditableSetList);
