import React from 'react';
import { render } from '@testing-library/react-native';
import ActiveWorkoutOverflowSheet from '../../src/components/ActiveWorkoutOverflowSheet';
import type { ActionSheetItem } from '../../src/components/ActionSheet';

let capturedItems: ActionSheetItem[] = [];
jest.mock('../../src/components/ActionSheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(({ items }: { items: ActionSheetItem[] }) => {
      capturedItems = items;
      return null;
    }),
  };
});

const exercise = (
  id: string,
  rest: number | null,
  modality = 'weight_reps'
) => ({
  id,
  exercise_snapshot: { name: id, modality, images: [] },
  sets: [
    { id: `${id}-0`, set_number: 1, set_type: 'normal', rest_time: rest },
    { id: `${id}-1`, set_number: 2, set_type: 'normal', rest_time: rest },
  ],
});

function renderSheet(onPressRest = jest.fn()) {
  render(
    <ActiveWorkoutOverflowSheet
      sheetRef={{ current: null }}
      overflowMenu={{ entryId: 'a', mode: 'main' }}
      session={
        { exercises: [exercise('a', 120)] } as unknown as React.ComponentProps<
          typeof ActiveWorkoutOverflowSheet
        >['session']
      }
      supersetRuns={[]}
      completedSetIds={{}}
      activeSetId={null}
      onDoExerciseNow={jest.fn()}
      onPressThumb={jest.fn()}
      onToggleExerciseNote={jest.fn()}
      onReplaceExercise={jest.fn()}
      onPressRest={onPressRest}
      canAddWarmups={() => false}
      onAddWarmups={jest.fn()}
      onClearExerciseSets={jest.fn()}
      onRemoveExercise={jest.fn()}
      onSelectSupersetPartner={jest.fn()}
      onUngroupExercise={jest.fn()}
      onSwitchToPickMode={jest.fn()}
      onSwitchToSwapMode={jest.fn()}
      onSwitchToMainMode={jest.fn()}
      onDismiss={jest.fn()}
    />
  );
  return onPressRest;
}

describe('ActiveWorkoutOverflowSheet rest timer row', () => {
  it('offers "Rest timer · 2:00" that opens the rest sheet', () => {
    const onPressRest = renderSheet();
    const item = capturedItems.find((i) => i.key === 'rest');
    expect(item?.label).toBe('Rest timer · 2:00');
    item?.onPress?.();
    expect(onPressRest).toHaveBeenCalledWith('a');
  });
});
