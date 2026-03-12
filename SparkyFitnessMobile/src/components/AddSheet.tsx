import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useUniwind, useCSSVariable } from 'uniwind';
import Icon, { type IconName } from './Icon';

export interface AddSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface AddSheetProps {
  onAddFood: () => void;
}

interface ActionCard {
  label: string;
  icon: IconName;
  onPress?: () => void;
}

const AddSheet = React.forwardRef<AddSheetRef, AddSheetProps>(
  ({ onAddFood }, ref) => {
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

    const handleAddFood = useCallback(() => {
      bottomSheetRef.current?.dismiss();
      onAddFood();
    }, [onAddFood]);

    const cards: ActionCard[] = [
      { label: 'Add Food', icon: 'meal-snack', onPress: handleAddFood },
      { label: 'Add Workout', icon: 'exercise-weights' },
      { label: 'Add Activity', icon: 'exercise' },
      { label: 'Add Measurement', icon: 'chart-bar' },
    ];

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
            <TouchableOpacity
              className="flex-1 mr-1.5 items-center rounded-xl py-5"
              style={{ backgroundColor: raisedBg }}
              activeOpacity={0.7}
              onPress={cards[0].onPress}
            >
              <Icon name={cards[0].icon} size={32} color={accentPrimary} />
              <Text className="text-text-primary text-sm font-medium mt-2">
                {cards[0].label}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 ml-1.5 items-center rounded-xl py-5"
              style={{ backgroundColor: raisedBg }}
              activeOpacity={0.7}
              onPress={cards[1].onPress}
            >
              <Icon name={cards[1].icon} size={32} color={accentPrimary} />
              <Text className="text-text-primary text-sm font-medium mt-2">
                {cards[1].label}
              </Text>
            </TouchableOpacity>
          </View>
          <View className="flex-row">
            <TouchableOpacity
              className="flex-1 mr-1.5 items-center rounded-xl py-5"
              style={{ backgroundColor: raisedBg }}
              activeOpacity={0.7}
              onPress={cards[2].onPress}
            >
              <Icon name={cards[2].icon} size={32} color={accentPrimary} />
              <Text className="text-text-primary text-sm font-medium mt-2">
                {cards[2].label}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 ml-1.5 items-center rounded-xl py-5"
              style={{ backgroundColor: raisedBg }}
              activeOpacity={0.7}
              onPress={cards[3].onPress}
            >
              <Icon name={cards[3].icon} size={32} color={accentPrimary} />
              <Text className="text-text-primary text-sm font-medium mt-2">
                {cards[3].label}
              </Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

AddSheet.displayName = 'AddSheet';

export default AddSheet;
