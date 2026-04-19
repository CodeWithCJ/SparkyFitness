import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, Pressable, LayoutAnimation } from 'react-native';
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
  onAddFromPreset: () => void;
  onSyncHealthData: () => void;
  onBarcodeScan: () => void;
}

interface ActionCard {
  label: string;
  icon: IconName;
  onPress?: () => void;
}

const AddSheet = React.forwardRef<AddSheetRef, AddSheetProps>(
  ({ onAddFood, onAddWorkout, onAddActivity, onAddFromPreset, onSyncHealthData, onBarcodeScan }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const isDismissingRef = useRef(false);
    const pendingPresentRef = useRef(false);
    const presentFrameRef = useRef<number | null>(null);
    const [showExerciseMenu, setShowExerciseMenu] = useState(false);
    const { theme } = useUniwind();
    const isDarkMode = theme === 'dark' || theme === 'amoled';

    const [surfaceBg, textMuted, accentPrimary, raisedBg, textSecondary] =
      useCSSVariable([
        '--color-surface',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-raised',
        '--color-text-secondary',
      ]) as [string, string, string, string, string];

    const schedulePresent = useCallback(() => {
      if (presentFrameRef.current != null) {
        cancelAnimationFrame(presentFrameRef.current);
      }

      presentFrameRef.current = requestAnimationFrame(() => {
        presentFrameRef.current = null;
        bottomSheetRef.current?.present();
      });
    }, []);

    useImperativeHandle(ref, () => ({
      present: () => {
        pendingPresentRef.current = true;
        if (isDismissingRef.current) {
          return;
        }
        schedulePresent();
      },
      dismiss: () => {
        pendingPresentRef.current = false;
        isDismissingRef.current = true;
        if (presentFrameRef.current != null) {
          cancelAnimationFrame(presentFrameRef.current);
          presentFrameRef.current = null;
        }
        bottomSheetRef.current?.dismiss();
      },
    }), [schedulePresent]);

    useEffect(() => {
      const sheetRef = bottomSheetRef.current;
      return () => {
        if (presentFrameRef.current != null) {
          cancelAnimationFrame(presentFrameRef.current);
        }
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

    const handleDismiss = useCallback(() => {
      isDismissingRef.current = false;
      setShowExerciseMenu(false);
      if (pendingPresentRef.current) {
        schedulePresent();
      }
    }, [schedulePresent]);

    const handleAnimate = useCallback((fromIndex: number, toIndex: number) => {
      if (fromIndex >= 0 && toIndex === -1) {
        isDismissingRef.current = true;
        return;
      }

      if (toIndex >= 0) {
        isDismissingRef.current = false;
        pendingPresentRef.current = false;
      }
    }, []);

    const cards: ActionCard[] = [
      { label: 'Food', icon: 'food', onPress: onAddFood },
      { label: 'Exercise', icon: 'exercise-weights' },
      { label: 'Sync Health Data', icon: 'sync', onPress: onSyncHealthData },
      { label: 'Barcode Scan', icon: 'scan', onPress: onBarcodeScan },
    ];

    const renderCard = (card: ActionCard) => (
      <Button
        key={card.label}
        variant="primary"
        className="flex-1 py-5 mx-1.5"
        style={{ backgroundColor: raisedBg }}
        onPress={() => {
          if (card.onPress) {
            handleAction(card.onPress);
          } else {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowExerciseMenu(true);
          }
        }}
      >
        <Icon name={card.icon} size={32} color={accentPrimary} />
        <Text className="text-text-primary text-sm font-medium mt-2">
          {card.label}
        </Text>
      </Button>
    );

    const renderExerciseOption = (
      label: string,
      subtitle: string,
      icon: IconName,
      onPress: () => void,
    ) => (
      <Button
        key={label}
        variant="primary"
        className="flex-1 py-5 mx-1.5"
        style={{ backgroundColor: raisedBg }}
        onPress={() => handleAction(onPress)}
      >
        <View className="h-10 items-center justify-center">
          <Icon name={icon} size={32} color={accentPrimary} />
        </View>
        <Text className="text-text-primary text-sm font-medium mt-2">
          {label}
        </Text>
        <Text className="text-xs mt-1 text-center" numberOfLines={2} style={{ color: textSecondary, minHeight: 32 }}>
          {subtitle}
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
        onAnimate={handleAnimate}
        onDismiss={handleDismiss}
      >
        <BottomSheetView className="pb-5 px-2.5">
          {showExerciseMenu ? (
            <>
              <Pressable
                className="flex-row items-center mb-3 px-1.5"
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setShowExerciseMenu(false);
                }}
              >
                <Icon name="chevron-back" size={20} color={accentPrimary} />
                <Text className="text-sm font-medium ml-1" style={{ color: accentPrimary }}>
                  Back
                </Text>
              </Pressable>
              <View className="flex-row">
                {renderExerciseOption('Workout', 'Sets & reps', 'exercise-weights', onAddWorkout)}
                {renderExerciseOption('Activity', 'Duration & distance', 'exercise-running', onAddActivity)}
                {renderExerciseOption('Preset', 'Use a template', 'bookmark', onAddFromPreset)}
              </View>
            </>
          ) : (
            <>
              <View className="flex-row mb-3">
                {renderCard(cards[0])}
                {renderCard(cards[1])}
              </View>
              <View className="flex-row">
                {renderCard(cards[2])}
                {renderCard(cards[3])}
              </View>
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

AddSheet.displayName = 'AddSheet';

export default AddSheet;
