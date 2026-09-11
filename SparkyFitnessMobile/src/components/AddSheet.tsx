import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, Text, Pressable, LayoutAnimation } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';

import Icon, { type IconName } from './Icon';
import Button from './ui/Button';
import { useSheetBackdrop } from './ui/sheetChrome';

export interface AddSheetRef {
  present: (options?: { initialMenu?: 'exercise' }) => void;
  dismiss: () => void;
}

export const addSheetRef = React.createRef<AddSheetRef>();

interface AddSheetProps {
  onAddFood: () => void;
  onStartWorkout: () => void;
  onAddActivity: () => void;
  onLogWorkout: () => void;
  onSyncHealthData: () => void;
  onBarcodeScan: () => void;
  onAddMeasurements: () => void;
  onAddProgressPhotos: () => void;
  onAskSparky: () => void;
  onOpenCycle?: () => void;
  showCycleCard?: boolean;
  cycleLabel?: string;
  cycleIcon?: IconName;
  onDismissWithoutAction?: () => void;
}

interface ActionCard {
  label: string;
  icon: IconName;
  onPress?: () => void;
}

const AddSheet = React.forwardRef<AddSheetRef, AddSheetProps>(
  (
    {
      onAddFood,
      onStartWorkout,
      onAddActivity,
      onLogWorkout,
      onSyncHealthData,
      onBarcodeScan,
      onAddMeasurements,
      onAddProgressPhotos,
      onAskSparky,
      onOpenCycle,
      showCycleCard,
      cycleLabel,
      cycleIcon,
      onDismissWithoutAction,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const isDismissingRef = useRef(false);
    const isOpenRef = useRef(false);
    const isPresentingRef = useRef(false);
    const selectedActionRef = useRef(false);
    const pendingPresentRef = useRef(false);
    const pendingInitialMenuRef = useRef<'exercise' | null>(null);
    const presentFrameRef = useRef<number | null>(null);
    const [showExerciseMenu, setShowExerciseMenu] = useState(false);

    const [surfaceBg, textMuted, accentPrimary, raisedBg, textSecondary] =
      useCSSVariable([
        '--color-surface',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-raised',
        '--color-text-secondary',
      ]) as [string, string, string, string, string];

    const clearScheduledPresent = useCallback(() => {
      if (presentFrameRef.current != null) {
        cancelAnimationFrame(presentFrameRef.current);
        presentFrameRef.current = null;
      }
    }, []);

    const schedulePresent = useCallback(() => {
      clearScheduledPresent();
      isPresentingRef.current = true;
      presentFrameRef.current = requestAnimationFrame(() => {
        presentFrameRef.current = null;
        bottomSheetRef.current?.present();
      });
    }, [clearScheduledPresent]);

    useImperativeHandle(
      ref,
      () => ({
        present: (options) => {
          const initialMenu = options?.initialMenu ?? null;
          if (isDismissingRef.current) {
            pendingPresentRef.current = true;
            pendingInitialMenuRef.current = initialMenu;
            setShowExerciseMenu(initialMenu === 'exercise');
            return;
          }

          if (isOpenRef.current || isPresentingRef.current) {
            return;
          }

          pendingPresentRef.current = false;
          pendingInitialMenuRef.current = null;
          selectedActionRef.current = false;
          setShowExerciseMenu(initialMenu === 'exercise');
          schedulePresent();
        },
        dismiss: () => {
          pendingPresentRef.current = false;
          pendingInitialMenuRef.current = null;
          isPresentingRef.current = false;
          isDismissingRef.current = true;
          clearScheduledPresent();
          bottomSheetRef.current?.dismiss();
        },
      }),
      [clearScheduledPresent, schedulePresent]
    );

    useEffect(() => {
      const sheetRef = bottomSheetRef.current;
      return () => {
        clearScheduledPresent();
        sheetRef?.dismiss();
      };
    }, [clearScheduledPresent]);

    const renderBackdrop = useSheetBackdrop();

    const handleAction = useCallback(
      (action?: () => void) => {
        pendingPresentRef.current = false;
        pendingInitialMenuRef.current = null;
        selectedActionRef.current = true;
        isPresentingRef.current = false;
        isDismissingRef.current = true;
        clearScheduledPresent();
        bottomSheetRef.current?.dismiss();
        action?.();
      },
      [clearScheduledPresent]
    );

    const handleDismiss = useCallback(() => {
      isDismissingRef.current = false;
      isOpenRef.current = false;
      if (pendingPresentRef.current) {
        const initialMenu = pendingInitialMenuRef.current;
        pendingPresentRef.current = false;
        pendingInitialMenuRef.current = null;
        selectedActionRef.current = false;
        setShowExerciseMenu(initialMenu === 'exercise');
        schedulePresent();
      } else {
        if (!selectedActionRef.current) {
          onDismissWithoutAction?.();
        }
        selectedActionRef.current = false;
        isPresentingRef.current = false;
        pendingInitialMenuRef.current = null;
      }
    }, [onDismissWithoutAction, schedulePresent]);

    const handleAnimate = useCallback(
      (fromIndex: number, toIndex: number) => {
        if (fromIndex >= 0 && toIndex === -1) {
          isDismissingRef.current = true;
          isOpenRef.current = false;
          isPresentingRef.current = false;
          return;
        }

        if (toIndex >= 0) {
          isDismissingRef.current = false;
          isOpenRef.current = true;
          isPresentingRef.current = false;
          pendingPresentRef.current = false;
          pendingInitialMenuRef.current = null;
          clearScheduledPresent();
        }
      },
      [clearScheduledPresent]
    );

    const cards: ActionCard[] = [
      {
        label: t('addSheet.food', { defaultValue: 'Food' }),
        icon: 'food',
        onPress: onAddFood,
      },
      {
        label: t('addSheet.exercise', { defaultValue: 'Exercise' }),
        icon: 'exercise-weights',
      },
      {
        label: t('addSheet.measurements', { defaultValue: 'Measurements' }),
        icon: 'measurements',
        onPress: onAddMeasurements,
      },
      {
        label: t('addSheet.scanFood', { defaultValue: 'Scan Food' }),
        icon: 'scan',
        onPress: onBarcodeScan,
      },
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
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut
            );
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

    const renderSecondaryRow = (
      label: string,
      icon: IconName,
      onPress: () => void
    ) => (
      <Button
        variant="primary"
        className="flex-row items-center justify-center py-3 mx-1.5 mt-3"
        style={{ backgroundColor: raisedBg }}
        onPress={() => handleAction(onPress)}
      >
        <Icon name={icon} size={20} color={accentPrimary} />
        <Text className="text-text-primary text-sm font-medium ml-2">
          {label}
        </Text>
      </Button>
    );

    const renderExerciseOption = (
      label: string,
      subtitle: string,
      icon: IconName,
      onPress: () => void
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
        <Text
          className="text-text-primary text-sm font-medium mt-2 text-center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {label}
        </Text>
        <Text
          className="text-xs mt-1 text-center"
          numberOfLines={2}
          style={{ color: textSecondary, minHeight: 32 }}
        >
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
        <BottomSheetView className="pb-safe-or-5 px-2.5">
          {showExerciseMenu ? (
            <>
              <Pressable
                className="flex-row items-center mb-3 px-1.5"
                accessibilityRole="button"
                accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
                onPress={() => {
                  LayoutAnimation.configureNext(
                    LayoutAnimation.Presets.easeInEaseOut
                  );
                  setShowExerciseMenu(false);
                }}
              >
                <Icon name="chevron-back" size={20} color={accentPrimary} />
                <Text
                  className="text-sm font-medium ml-1"
                  style={{ color: accentPrimary }}
                >
                  {t('common.back', { defaultValue: 'Back' })}
                </Text>
              </Pressable>
              <View className="flex-row">
                {renderExerciseOption(
                  t('addSheet.workout', { defaultValue: 'Workout' }),
                  t('addSheet.liveSets', { defaultValue: 'Live sets & reps' }),
                  'exercise-weights',
                  onStartWorkout
                )}
                {renderExerciseOption(
                  t('addSheet.activity', { defaultValue: 'Activity' }),
                  t('addSheet.durationDistance', {
                    defaultValue: 'Duration & distance',
                  }),
                  'exercise-running-filled',
                  onAddActivity
                )}
                {renderExerciseOption(
                  t('addSheet.logWorkout', { defaultValue: 'Log Workout' }),
                  t('addSheet.pastSets', { defaultValue: 'Past sets & reps' }),
                  'pencil',
                  onLogWorkout
                )}
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
              {renderSecondaryRow(
                t('addSheet.progressPhotos', {
                  defaultValue: 'Progress Photos',
                }),
                'camera',
                onAddProgressPhotos
              )}
              {showCycleCard && onOpenCycle
                ? renderSecondaryRow(
                    cycleLabel ??
                      t('addSheet.wellness', { defaultValue: 'Wellness' }),
                    cycleIcon ?? 'wellness-filled',
                    onOpenCycle
                  )
                : null}
              {renderSecondaryRow(
                t('addSheet.askSparky', { defaultValue: 'Ask Sparky' }),
                'sparkles',
                onAskSparky
              )}
              {renderSecondaryRow(
                t('addSheet.syncHealth', { defaultValue: 'Sync Health Data' }),
                'sync',
                onSyncHealthData
              )}
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

AddSheet.displayName = 'AddSheet';

export default AddSheet;
