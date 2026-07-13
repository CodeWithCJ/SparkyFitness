import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useUniwind, useCSSVariable } from 'uniwind';
import Icon from './Icon';

// Render the sheet inside an iOS UIWindow so it sits above any native modal
// presentation (the workout form screens present modally). No-op on Android.
const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => <FullWindowOverlay>{children}</FullWindowOverlay>
    : undefined;

export interface ActionSheetItem {
  key: string;
  label: string;
  /** Danger tint on the label. */
  destructive?: boolean;
  /**
   * Default true. False keeps the sheet presented so the item can swap the
   * content in place (e.g. a main menu → pick-list stage).
   */
  dismissOnPress?: boolean;
  onPress: () => void;
}

export interface ActionSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface ActionSheetProps {
  title: string;
  items: ActionSheetItem[];
  /** Renders a back chevron left of the title (content-swap flows). */
  onBack?: () => void;
  onDismiss?: () => void;
}

/**
 * A menu-style bottom sheet: a titled list of one-shot actions. Selection
 * state belongs to BottomSheetPicker; this is for overflow/context menus.
 *
 * Owners must set the state that drives `title`/`items` BEFORE calling
 * `present()`. When a present lands while the sheet is still animating
 * closed, it is queued and the interrupted dismissal's `onDismiss` is
 * swallowed — correct only because the queued present's state has already
 * overwritten the old.
 */
const ActionSheet = React.forwardRef<ActionSheetRef, ActionSheetProps>(
  ({ title, items, onBack, onDismiss }, ref) => {
    const modalRef = useRef<BottomSheetModal>(null);
    const isDismissingRef = useRef(false);
    const isOpenRef = useRef(false);
    const isPresentingRef = useRef(false);
    const pendingPresentRef = useRef(false);
    const presentFrameRef = useRef<number | null>(null);
    // Mirrors the modal's open state for the Android hardware-back listener.
    // Cleared in onDismiss (the terminal signal), not at dismissal start, so a
    // Back press during the close animation is still swallowed by the sheet.
    const [isOpen, setIsOpen] = useState(false);
    const { theme } = useUniwind();
    const isDarkMode = theme === 'dark' || theme === 'amoled';

    const [surfaceBg, textMuted, accentPrimary] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-accent-primary',
    ]) as [string, string, string];

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
        modalRef.current?.present();
      });
    }, [clearScheduledPresent]);

    const presentSheet = useCallback(() => {
      if (isDismissingRef.current) {
        pendingPresentRef.current = true;
        return;
      }
      if (isOpenRef.current || isPresentingRef.current) {
        return;
      }
      pendingPresentRef.current = false;
      schedulePresent();
    }, [schedulePresent]);

    const dismissSheet = useCallback(() => {
      pendingPresentRef.current = false;
      isPresentingRef.current = false;
      isDismissingRef.current = true;
      clearScheduledPresent();
      modalRef.current?.dismiss();
    }, [clearScheduledPresent]);

    useImperativeHandle(ref, () => ({ present: presentSheet, dismiss: dismissSheet }), [
      presentSheet,
      dismissSheet,
    ]);

    useEffect(() => {
      const modal = modalRef.current;
      return () => {
        clearScheduledPresent();
        modal?.dismiss();
      };
    }, [clearScheduledPresent]);

    useEffect(() => {
      if (!isOpen || Platform.OS !== 'android') return;
      // Registered while open (after any screen handlers), so the sheet wins
      // Back and the press can't fall through and pop the screen.
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        dismissSheet();
        return true;
      });
      return () => subscription.remove();
    }, [isOpen, dismissSheet]);

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
          clearScheduledPresent();
          setIsOpen(true);
        }
      },
      [clearScheduledPresent],
    );

    const handleDismiss = useCallback(() => {
      isDismissingRef.current = false;
      isOpenRef.current = false;
      setIsOpen(false);
      if (pendingPresentRef.current) {
        // A newer present interrupted this dismissal. Run it and swallow the
        // owner's onDismiss so the stale close can't clear the newer state.
        pendingPresentRef.current = false;
        schedulePresent();
        return;
      }
      isPresentingRef.current = false;
      onDismiss?.();
    }, [onDismiss, schedulePresent]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          opacity={isDarkMode ? 0.7 : 0.5}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      [isDarkMode],
    );

    const handleItemPress = (item: ActionSheetItem) => {
      if (item.dismissOnPress === false) {
        item.onPress();
        return;
      }
      dismissSheet();
      item.onPress();
    };

    return (
      <BottomSheetModal
        ref={modalRef}
        enableDynamicSizing
        maxDynamicContentSize={500}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
        onAnimate={handleAnimate}
        onDismiss={handleDismiss}
      >
        <BottomSheetScrollView contentContainerClassName="pb-safe-or-5">
          <View className="px-4 py-4 border-b border-border-subtle">
            <Text
              numberOfLines={1}
              className="text-lg font-semibold text-center text-text-primary px-8"
            >
              {title}
            </Text>
            {onBack && (
              <Pressable
                onPress={onBack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Back"
                className="absolute left-2 top-0 bottom-0 justify-center px-2"
              >
                <Icon name="chevron-back" size={20} color={accentPrimary} />
              </Pressable>
            )}
          </View>
          {items.map((item) => (
            <Pressable
              key={item.key}
              testID={`action-sheet-item-${item.key}`}
              onPress={() => handleItemPress(item)}
              className="flex-row items-center px-4 py-3.5 border-b border-border-subtle"
              style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Text
                className={`text-base font-medium ${
                  item.destructive ? 'text-text-danger-subtle' : 'text-text-primary'
                }`}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

ActionSheet.displayName = 'ActionSheet';

export default ActionSheet;
