import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { View, Text } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useUniwind, useCSSVariable } from 'uniwind';
import Icon, { type IconName } from './Icon';
import Button from './ui/Button';

export interface AddSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface AddSheetProps {
  onAddFood: () => void;
  onAddWorkout: () => void;
  onAddActivity: () => void;
}

interface ActionCard {
  label: string;
  icon: IconName;
  onPress?: () => void;
}

const AddSheet = React.forwardRef<AddSheetRef, AddSheetProps>(
  ({ onAddFood, onAddWorkout, onAddActivity }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { theme } = useUniwind();
    const isDarkMode = theme === 'dark' || theme === 'amoled';

    const [surfaceBg, textMuted, accentPrimary, raisedBg] =
      useCSSVariable([
        '--color-surface',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-raised',
      ]) as [string, string, string, string];

    useImperativeHandle(ref, () => ({
      present: () => bottomSheetRef.current?.present(),
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    useEffect(() => {
      const sheetRef = bottomSheetRef.current;
      return () => {
        sheetRef?.dismiss();
      };
    }, []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          opacity={isDarkMode ? 0.7 : 0.5}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      [isDarkMode]
    );

    const handleAction = useCallback((action?: () => void) => {
      bottomSheetRef.current?.dismiss();
      action?.();
    }, []);

    const cards: ActionCard[] = [
      { label: 'Add Food', icon: 'meal-snack', onPress: onAddFood },
      { label: 'Add Workout', icon: 'exercise-weights', onPress: onAddWorkout },
      { label: 'Add Activity', icon: 'exercise', onPress: onAddActivity },
      { label: 'Add Measurement', icon: 'chart-bar' },
    ];

    const renderCard = (card: ActionCard, isLeft: boolean) => (
      <Button
        key={card.label}
        variant="primary"
        className={`flex-1 py-5 ${isLeft ? 'mr-1.5' : 'ml-1.5'}`}
        style={{ backgroundColor: raisedBg }}
        onPress={() => handleAction(card.onPress)}
      >
        <Icon name={card.icon} size={32} color={accentPrimary} />
        <Text className="text-text-primary text-sm font-medium mt-2">
          {card.label}
        </Text>
      </Button>
    );

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <BottomSheetView className="pb-5 px-4">
          <View className="flex-row mb-3">
            {renderCard(cards[0], true)}
            {renderCard(cards[1], false)}
          </View>
          <View className="flex-row">
            {renderCard(cards[2], true)}
            {renderCard(cards[3], false)}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

AddSheet.displayName = 'AddSheet';

export default AddSheet;
