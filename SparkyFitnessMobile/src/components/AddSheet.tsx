import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Pressable,
  LayoutAnimation,
  StyleSheet,
} from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';

import AddMenuIconTile, { useAddMenuTintColors } from './AddMenuIconTile';
import Icon, { type IconName } from './Icon';
import { useSheetBackdrop, useSheetHardwareBack } from './ui/sheetChrome';
import {
  ADD_MENU_CARD_LABELS,
  ADD_MENU_ITEM_ICONS,
  ADD_MENU_ITEM_LABELS,
  ADD_MENU_ITEM_TINTS,
  type AddMenuItemKey,
  type AddMenuRowStyle,
} from '../constants/addMenuItems';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  chunkIntoLines,
  groupRowsByStyle,
  resolveAddMenuCards,
  rowKeys,
} from '../utils/addMenu';

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
  /** Starts the guided check-in. */
  onStartCheckIn?: () => void;
  onAddSymptoms?: () => void;
  onAddMood?: () => void;
  onAddMindfulness?: () => void;
  onRecordActivity?: () => void;
  onOpenCycle?: () => void;
  showCycleCard?: boolean;
  cycleLabel?: string;
  cycleIcon?: IconName;
  onDismissWithoutAction?: () => void;
}

/** What one item in the sheet looks like and does, as a card or a row. */
interface MenuItemDef {
  label: string;
  /** A word at the right of a list row, or under the label of a compact one. */
  hint?: string;
  icon: IconName;
  /** Missing for Exercise, which opens the sub-menu instead. */
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
      onStartCheckIn,
      onAddSymptoms,
      onAddMood,
      onAddMindfulness,
      onRecordActivity,
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
    const addMenuCards = useAppPreferencesStore((st) => st.addMenuCards);
    const addMenuOrder = useAppPreferencesStore((st) => st.addMenuOrder);
    const addMenuRowStyles = useAppPreferencesStore(
      (st) => st.addMenuRowStyles
    );
    const hiddenAddMenuItems = useAppPreferencesStore(
      (st) => st.hiddenAddMenuItems
    );
    // Mirrors the modal's open state for the Android hardware-back listener.
    // Cleared in onDismiss (the terminal signal), not at dismissal start, so a
    // Back press during the close animation is still swallowed by the sheet.
    const [isOpen, setIsOpen] = useState(false);

    const [
      surfaceBg,
      textMuted,
      accentPrimary,
      raisedBg,
      textSecondary,
      borderSubtle,
    ] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-accent-primary',
      '--color-raised',
      '--color-text-secondary',
      '--color-border-subtle',
    ]) as string[];
    const tintColors = useAddMenuTintColors();

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

    const dismissSheet = useCallback(() => {
      pendingPresentRef.current = false;
      pendingInitialMenuRef.current = null;
      isPresentingRef.current = false;
      isDismissingRef.current = true;
      clearScheduledPresent();
      bottomSheetRef.current?.dismiss();
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
        dismiss: dismissSheet,
      }),
      [dismissSheet, schedulePresent]
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
      setIsOpen(false);
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

    // The sheet is opening or open. Called from onAnimate and from onChange:
    // when the open finishes before onAnimate reaches JS (Android's "Remove
    // animations", or a busy JS thread), the library drops onAnimate, and
    // onChange is the only signal that arrives.
    const markOpen = useCallback(() => {
      isDismissingRef.current = false;
      isOpenRef.current = true;
      isPresentingRef.current = false;
      pendingPresentRef.current = false;
      pendingInitialMenuRef.current = null;
      clearScheduledPresent();
      setIsOpen(true);
    }, [clearScheduledPresent]);

    const handleAnimate = useCallback(
      (fromIndex: number, toIndex: number) => {
        if (fromIndex >= 0 && toIndex === -1) {
          isDismissingRef.current = true;
          isOpenRef.current = false;
          isPresentingRef.current = false;
          return;
        }

        if (toIndex >= 0) {
          markOpen();
        }
      },
      [markOpen]
    );

    // Exercise has no action of its own: it opens the sub-menu, wherever it sits.
    const press = (onPress?: () => void) => {
      if (onPress) {
        handleAction(onPress);
        return;
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowExerciseMenu(true);
    };

    const handleChange = useCallback(
      (index: number) => {
        if (index >= 0) {
          markOpen();
        }
      },
      [markOpen]
    );

    const showMainMenu = useCallback(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowExerciseMenu(false);
    }, []);

    // Back does what the sheet's own Back link does: from the Exercise menu it
    // returns to the main menu, and from the main menu it closes the sheet.
    const handleHardwareBack = useCallback(() => {
      // Already closing (an option was picked, or Back was pressed twice):
      // only swallow the press, so the menu does not change as the sheet goes.
      if (isDismissingRef.current) return;
      if (showExerciseMenu) {
        showMainMenu();
      } else {
        dismissSheet();
      }
    }, [dismissSheet, showExerciseMenu, showMainMenu]);

    useSheetHardwareBack(isOpen, handleHardwareBack);

    const renderCard = (key: AddMenuItemKey, def: MenuItemDef) => (
      <Pressable
        key={key}
        className="flex-1 items-center px-0.5"
        accessibilityRole="button"
        accessibilityLabel={def.label}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        onPress={() => press(def.onPress)}
      >
        <AddMenuIconTile
          icon={def.icon}
          color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
          size="card"
        />
        <Text
          className="text-text-primary text-sm font-medium mt-2 text-center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {ADD_MENU_CARD_LABELS[key]?.(t) ?? def.label}
        </Text>
      </Pressable>
    );

    const renderListRow = (key: AddMenuItemKey, def: MenuItemDef) => (
      <Pressable
        key={key}
        className="flex-row items-center px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={def.label}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        onPress={() => press(def.onPress)}
      >
        <AddMenuIconTile
          icon={def.icon}
          color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
          size="row"
        />
        <Text
          className="flex-1 text-text-primary text-base font-medium ml-3"
          numberOfLines={1}
        >
          {def.label}
        </Text>
        {def.hint ? (
          <Text className="text-sm mr-2" style={{ color: textMuted }}>
            {def.hint}
          </Text>
        ) : null}
        <Icon name="chevron-forward" size={14} color={textMuted} />
      </Pressable>
    );

    const renderCompactRow = (key: AddMenuItemKey, def: MenuItemDef) => (
      <Pressable
        key={key}
        className="flex-1 flex-row items-center px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={def.label}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        onPress={() => press(def.onPress)}
      >
        <AddMenuIconTile
          icon={def.icon}
          color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
          size="row"
        />
        <View className="flex-1 ml-3">
          <Text
            className="text-text-primary text-base font-medium"
            numberOfLines={1}
          >
            {def.label}
          </Text>
          {def.hint ? (
            <Text
              className="text-xs mt-0.5"
              numberOfLines={1}
              style={{ color: textSecondary }}
            >
              {def.hint}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );

    const renderActionButton = (key: AddMenuItemKey, def: MenuItemDef) => {
      const isAccent = key === 'askSparky';
      return (
        <Pressable
          key={key}
          className="flex-1 flex-row items-center justify-center py-3.5 rounded-2xl mx-1.5"
          accessibilityRole="button"
          accessibilityLabel={def.label}
          style={({ pressed }) => ({
            backgroundColor: isAccent ? 'transparent' : raisedBg,
            borderWidth: 1,
            borderColor: isAccent ? accentPrimary : borderSubtle,
            opacity: pressed ? 0.7 : 1,
          })}
          onPress={() => press(def.onPress)}
        >
          {isAccent ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: 16,
                  backgroundColor: accentPrimary,
                  opacity: 0.1,
                },
              ]}
            />
          ) : null}
          <Icon
            name={def.icon}
            size={20}
            color={isAccent ? accentPrimary : textSecondary}
          />
          <Text
            className="text-text-primary text-base font-medium ml-2"
            style={isAccent ? { color: accentPrimary } : undefined}
          >
            {def.label}
          </Text>
        </Pressable>
      );
    };

    // A row of the Exercise sub-menu: a tinted tile, the name, what it does
    // underneath, and a chevron, like the rows of the main menu.
    const renderExerciseOption = (
      label: string,
      subtitle: string,
      icon: IconName,
      tint: keyof typeof tintColors,
      onPress: () => void
    ) => (
      <Pressable
        key={label}
        className="flex-row items-center px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        onPress={() => handleAction(onPress)}
      >
        <AddMenuIconTile icon={icon} color={tintColors[tint]} size="row" />
        <View className="flex-1 ml-3">
          <Text
            className="text-text-primary text-base font-medium"
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            className="text-xs mt-0.5"
            numberOfLines={1}
            style={{ color: textSecondary }}
          >
            {subtitle}
          </Text>
        </View>
        <Icon name="chevron-forward" size={14} color={textMuted} />
      </Pressable>
    );

    // Everything the app can offer right now, keyed so the saved arrangement
    // from Settings → Quick Actions can place it. An item whose handler or
    // feature is off is simply absent, whatever the arrangement says. Names
    // come from the shared labels so the sheet and its settings cannot drift;
    // only the hints are the sheet's own, and the cycle row is named by the
    // cycle mode.
    const labelOf = (key: AddMenuItemKey) => ADD_MENU_ITEM_LABELS[key](t);
    const itemDefs: Partial<Record<AddMenuItemKey, MenuItemDef>> = {
      food: {
        label: labelOf('food'),
        icon: ADD_MENU_ITEM_ICONS.food,
        onPress: onAddFood,
      },
      exercise: {
        label: labelOf('exercise'),
        icon: ADD_MENU_ITEM_ICONS.exercise,
      },
      measurements: {
        label: labelOf('measurements'),
        icon: ADD_MENU_ITEM_ICONS.measurements,
        onPress: onAddMeasurements,
      },
      scanFood: {
        label: labelOf('scanFood'),
        icon: ADD_MENU_ITEM_ICONS.scanFood,
        onPress: onBarcodeScan,
      },
      checkIn: onStartCheckIn
        ? {
            label: labelOf('checkIn'),
            hint: t('addSheet.checkInHint', { defaultValue: 'Habits' }),
            icon: ADD_MENU_ITEM_ICONS.checkIn,
            onPress: onStartCheckIn,
          }
        : undefined,
      progressPhotos: {
        label: labelOf('progressPhotos'),
        hint: t('addSheet.photosHint', { defaultValue: 'Visual' }),
        icon: ADD_MENU_ITEM_ICONS.progressPhotos,
        onPress: onAddProgressPhotos,
      },
      wellness:
        showCycleCard && onOpenCycle
          ? {
              label: cycleLabel ?? labelOf('wellness'),
              icon: cycleIcon ?? ADD_MENU_ITEM_ICONS.wellness,
              onPress: onOpenCycle,
            }
          : undefined,
      symptoms: onAddSymptoms && {
        label: labelOf('symptoms'),
        hint: t('addSheet.symptomsHint', { defaultValue: 'Log' }),
        icon: ADD_MENU_ITEM_ICONS.symptoms,
        onPress: onAddSymptoms,
      },
      mood: onAddMood && {
        label: labelOf('mood'),
        hint: t('addSheet.moodHint', { defaultValue: 'Track state' }),
        icon: ADD_MENU_ITEM_ICONS.mood,
        onPress: onAddMood,
      },
      mindfulness: onAddMindfulness && {
        label: labelOf('mindfulness'),
        hint: t('addSheet.mindfulnessHint', {
          defaultValue: 'Breathing, zen',
        }),
        icon: ADD_MENU_ITEM_ICONS.mindfulness,
        onPress: onAddMindfulness,
      },
      askSparky: {
        label: labelOf('askSparky'),
        icon: ADD_MENU_ITEM_ICONS.askSparky,
        onPress: onAskSparky,
      },
      syncHealth: {
        label: labelOf('syncHealth'),
        icon: ADD_MENU_ITEM_ICONS.syncHealth,
        onPress: onSyncHealthData,
      },
    };
    const cardKeys = resolveAddMenuCards(addMenuCards);
    // The four cards share one panel. An unavailable one leaves its slot
    // empty so the others keep their width.
    const cards = cardKeys.map((key) => {
      const def = itemDefs[key];
      return def ? renderCard(key, def) : <View key={key} className="flex-1" />;
    });
    // Below the cards, each style gathers in its own place, keeping the
    // arranged order within it: list rows and compact pairs in one panel,
    // actions side by side at the foot.
    const shown = groupRowsByStyle(
      rowKeys(addMenuOrder, cardKeys).filter(
        (key) => itemDefs[key] && !hiddenAddMenuItems.includes(key)
      ),
      addMenuRowStyles
    );
    const withStyle = (style: AddMenuRowStyle) =>
      shown[style].flatMap((key) => {
        const def = itemDefs[key];
        return def ? [{ key, def }] : [];
      });
    const listRows = withStyle('list').map(({ key, def }) =>
      renderListRow(key, def)
    );
    const compactLines = chunkIntoLines(withStyle('compact')).map(
      (items, lineIndex) => {
        const line = items.map(({ key, def }) => renderCompactRow(key, def));
        // A pair puts a hairline between its two; one on its own takes the
        // whole line.
        if (line.length === 2) {
          line.splice(
            1,
            0,
            <View
              key={`divider-${lineIndex}`}
              style={{
                width: StyleSheet.hairlineWidth,
                backgroundColor: borderSubtle,
              }}
            />
          );
        }
        return (
          <View key={`compact-${lineIndex}`} className="flex-row">
            {line}
          </View>
        );
      }
    );
    // Buttons go two to a line too, so three do not squeeze into one.
    const actionLines = chunkIntoLines(withStyle('action')).map(
      (items, lineIndex) => (
        <View key={`action-${lineIndex}`} className="flex-row mt-3">
          {items.map(({ key, def }) => renderActionButton(key, def))}
        </View>
      )
    );
    // Hairlines between the panel's lines, in place of a border on each row.
    const panelLines = [...listRows, ...compactLines];

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
        onAnimate={handleAnimate}
        onChange={handleChange}
        onDismiss={handleDismiss}
      >
        <BottomSheetView className="pb-safe-or-5 px-2.5">
          {showExerciseMenu ? (
            <>
              <View className="flex-row items-center justify-between px-3 pt-1 pb-3">
                <Pressable
                  className="flex-row items-center"
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back', {
                    defaultValue: 'Back',
                  })}
                  hitSlop={10}
                  onPress={showMainMenu}
                >
                  <Icon name="chevron-back" size={20} color={accentPrimary} />
                  <Text
                    className="text-base font-semibold ml-1"
                    style={{ color: accentPrimary }}
                  >
                    {t('common.back', { defaultValue: 'Back' })}
                  </Text>
                </Pressable>
                <Text className="text-text-primary text-2xl font-bold">
                  {t('addSheet.exercise', { defaultValue: 'Exercise' })}
                </Text>
              </View>
              <View
                className="rounded-2xl mx-1.5 overflow-hidden"
                style={{ backgroundColor: raisedBg }}
              >
                {[
                  renderExerciseOption(
                    t('addSheet.workout', { defaultValue: 'Workout' }),
                    t('addSheet.liveSets', {
                      defaultValue: 'Live sets & reps',
                    }),
                    'exercise-weights',
                    'accent',
                    onStartWorkout
                  ),
                  renderExerciseOption(
                    t('addSheet.activity', { defaultValue: 'Activity' }),
                    t('addSheet.durationDistance', {
                      defaultValue: 'Duration & distance',
                    }),
                    'exercise-running-filled',
                    'green',
                    onAddActivity
                  ),
                  renderExerciseOption(
                    t('addSheet.logWorkout', { defaultValue: 'Log Workout' }),
                    t('addSheet.pastSets', {
                      defaultValue: 'Past sets & reps',
                    }),
                    'pencil',
                    'violet',
                    onLogWorkout
                  ),
                  ...(onRecordActivity
                    ? [
                        renderExerciseOption(
                          t('addSheet.recordActivity', {
                            defaultValue: 'Record Activity',
                          }),
                          t('addSheet.recordActivityHint', {
                            defaultValue: 'Track a walk, run or ride with GPS',
                          }),
                          'location',
                          'amber',
                          onRecordActivity
                        ),
                      ]
                    : []),
                ].map((row, index) => (
                  <View key={index}>
                    {index > 0 ? (
                      <View
                        style={{
                          height: StyleSheet.hairlineWidth,
                          backgroundColor: borderSubtle,
                        }}
                      />
                    ) : null}
                    {row}
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <View className="flex-row items-center justify-between px-3 pt-1 pb-3">
                <Text className="text-text-primary text-2xl font-bold">
                  {t('addSheet.title', { defaultValue: 'Quick Actions' })}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.done', {
                    defaultValue: 'Done',
                  })}
                  hitSlop={10}
                  onPress={() => bottomSheetRef.current?.dismiss()}
                >
                  <Text
                    className="text-base font-semibold"
                    style={{ color: accentPrimary }}
                  >
                    {t('common.done', { defaultValue: 'Done' })}
                  </Text>
                </Pressable>
              </View>
              <View
                className="flex-row rounded-2xl mx-1.5 px-2 py-4"
                style={{ backgroundColor: raisedBg }}
              >
                {cards}
              </View>
              {panelLines.length > 0 ? (
                <View
                  className="rounded-2xl mx-1.5 mt-3 overflow-hidden"
                  style={{ backgroundColor: raisedBg }}
                >
                  {panelLines.map((line, index) => (
                    <View key={index}>
                      {index > 0 ? (
                        <View
                          style={{
                            height: StyleSheet.hairlineWidth,
                            backgroundColor: borderSubtle,
                          }}
                        />
                      ) : null}
                      {line}
                    </View>
                  ))}
                </View>
              ) : null}
              {actionLines}
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

AddSheet.displayName = 'AddSheet';

export default AddSheet;
