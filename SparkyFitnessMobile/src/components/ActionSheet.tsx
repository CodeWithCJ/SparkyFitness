import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon, { type IconName } from './Icon';
import {
  sheetContainer,
  useSheetBackdrop,
  useSheetHardwareBack,
} from './ui/sheetChrome';

export interface ActionSheetItem {
  key: string;
  label: string;
  icon?: IconName;
  /**
   * Secondary line under the label, for actions whose difference cannot be
   * carried by a short label alone. Optional: an item without one renders
   * exactly as before.
   */
  description?: string;
  /**
   * Consecutive items sharing a group render as one block, separated from
   * adjacent blocks by a spacer band. Ungrouped items chunk together.
   */
  group?: string;
  /** Cards layout: a bold position number drawn before the label. */
  leading?: string;
  /** Cards layout: a small lilac pill after the label (a superset's A1 / A2). */
  badge?: string;
  /** Fill of the badge pill; defaults to the accent colour. */
  badgeColor?: string;
  /** Cards layout: draws the description in the accent colour. */
  accentDescription?: boolean;
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
  layout?: 'list' | 'grid' | 'cards';
  /** Renders a back chevron left of the title (content-swap flows). */
  onBack?: () => void;
  /** Cards layout: a Cancel pill right of the title that closes the sheet. */
  showCancel?: boolean;
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
  ({ title, items, layout = 'list', onBack, showCancel, onDismiss }, ref) => {
    const { t } = useTranslation();
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
    const { height: windowHeight } = useWindowDimensions();
    const sheetInsets = useSafeAreaInsets();
    // Never taller than the space between the status area and the bottom
    // edge, which is short in the Duo's wide pose.
    const maxSheetHeight = Math.min(
      windowHeight * 0.8,
      windowHeight - sheetInsets.top - sheetInsets.bottom - 24
    );

    const [
      surfaceBg,
      pageBg,
      textMuted,
      accentPrimary,
      textPrimary,
      iconDanger,
    ] = useCSSVariable([
      '--color-surface',
      '--color-background',
      '--color-text-muted',
      '--color-accent-primary',
      '--color-text-primary',
      '--color-icon-danger',
    ]) as [string, string, string, string, string, string];

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

    useImperativeHandle(
      ref,
      () => ({ present: presentSheet, dismiss: dismissSheet }),
      [presentSheet, dismissSheet]
    );

    useEffect(() => {
      const modal = modalRef.current;
      return () => {
        clearScheduledPresent();
        modal?.dismiss();
      };
    }, [clearScheduledPresent]);

    useSheetHardwareBack(isOpen, dismissSheet);

    // The sheet is opening or open. Called from onAnimate and from onChange:
    // when the open finishes before onAnimate reaches JS (Android's "Remove
    // animations", or a busy JS thread), the library drops onAnimate, and
    // onChange is the only signal that arrives.
    const markOpen = useCallback(() => {
      isDismissingRef.current = false;
      isOpenRef.current = true;
      isPresentingRef.current = false;
      pendingPresentRef.current = false;
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

    const handleChange = useCallback(
      (index: number) => {
        if (index >= 0) {
          markOpen();
        }
      },
      [markOpen]
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

    const renderBackdrop = useSheetBackdrop();

    const handleItemPress = (item: ActionSheetItem) => {
      if (item.dismissOnPress === false) {
        item.onPress();
        return;
      }
      dismissSheet();
      item.onPress();
    };

    const sections: ActionSheetItem[][] = [];
    for (const item of items) {
      const current = sections[sections.length - 1];
      if (current && current[0].group === item.group) {
        current.push(item);
      } else {
        sections.push([item]);
      }
    }

    return (
      <BottomSheetModal
        ref={modalRef}
        enableDynamicSizing
        maxDynamicContentSize={maxSheetHeight}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{
          // Cards sit on the page colour so each group's surface card shows,
          // as on the focus Set options page.
          backgroundColor: layout === 'cards' ? pageBg : surfaceBg,
          ...(layout === 'grid' || layout === 'cards'
            ? { borderTopLeftRadius: 28, borderTopRightRadius: 28 }
            : {}),
        }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
        onAnimate={handleAnimate}
        onChange={handleChange}
        onDismiss={handleDismiss}
      >
        <BottomSheetScrollView contentContainerClassName="pb-safe-or-5">
          {layout === 'cards' ? (
            <View className="px-4 pb-6 pt-1">
              <View className="mb-3 flex-row items-center gap-1">
                {onBack && (
                  <Pressable
                    testID="action-sheet-back"
                    onPress={onBack}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back', {
                      defaultValue: 'Back',
                    })}
                    className="-ml-2 h-11 w-9 items-center justify-center"
                  >
                    <Icon name="chevron-back" size={22} color={accentPrimary} />
                  </Pressable>
                )}
                <Text
                  numberOfLines={2}
                  accessibilityRole="header"
                  className="min-w-0 flex-1 text-[26px] font-extrabold text-text-primary"
                >
                  {title}
                </Text>
                {showCancel && (
                  <Pressable
                    testID="action-sheet-cancel"
                    onPress={dismissSheet}
                    accessibilityRole="button"
                    className="h-11 items-center justify-center rounded-full bg-raised px-4 active:opacity-70"
                  >
                    <Text className="text-[16px] font-bold text-text-primary">
                      {t('common.cancel', { defaultValue: 'Cancel' })}
                    </Text>
                  </Pressable>
                )}
              </View>
              <View className="gap-3">
                {sections.map((section) => (
                  <View
                    key={section[0].key}
                    testID="action-sheet-card"
                    className="overflow-hidden rounded-3xl bg-surface"
                  >
                    {section.map((item, index) => (
                      <Pressable
                        key={item.key}
                        testID={`action-sheet-item-${item.key}`}
                        onPress={() => handleItemPress(item)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          item.description
                            ? `${item.label}. ${item.description}`
                            : item.label
                        }
                        className={`min-h-12 flex-row items-center justify-between gap-4 px-5 py-2.5 active:opacity-70 ${index > 0 ? 'border-t border-border-subtle' : ''}`}
                      >
                        {item.leading != null && (
                          <Text
                            className="w-5 text-center text-[17px] font-bold text-text-secondary"
                            style={{ fontVariant: ['tabular-nums'] }}
                          >
                            {item.leading}
                          </Text>
                        )}
                        <View className="min-w-0 flex-1">
                          <Text
                            className={`text-[17px] font-bold ${item.destructive ? 'text-icon-danger' : 'text-text-primary'}`}
                          >
                            {item.label}
                          </Text>
                          {item.description ? (
                            <Text
                              className="text-[13px] font-semibold text-text-secondary"
                              style={
                                item.accentDescription
                                  ? { color: accentPrimary }
                                  : undefined
                              }
                            >
                              {item.description}
                            </Text>
                          ) : null}
                        </View>
                        {item.badge != null && (
                          <View
                            className="rounded-full px-2.5 py-0.5"
                            style={{
                              backgroundColor: item.badgeColor ?? accentPrimary,
                            }}
                          >
                            <Text className="text-[13px] font-extrabold text-black">
                              {item.badge}
                            </Text>
                          </View>
                        )}
                        {item.icon != null && (
                          <View accessible={false}>
                            <Icon
                              name={item.icon}
                              size={20}
                              color={
                                item.destructive ? iconDanger : textPrimary
                              }
                            />
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <>
              <View
                className={
                  layout === 'grid'
                    ? 'px-5 pt-2 pb-4'
                    : 'px-4 py-4 border-b border-border-subtle'
                }
              >
                <Text
                  numberOfLines={1}
                  accessibilityRole="header"
                  className={
                    layout === 'grid'
                      ? 'text-xl font-semibold text-text-primary pr-12'
                      : 'text-lg font-semibold text-center text-text-primary px-8'
                  }
                >
                  {title}
                </Text>
                {layout === 'grid' && (
                  <Pressable
                    onPress={dismissSheet}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close', {
                      defaultValue: 'Close',
                    })}
                    className="absolute right-4 top-0 w-11 h-11 items-center justify-center rounded-full bg-raised"
                  >
                    <Icon name="close" size={20} color={textMuted} />
                  </Pressable>
                )}
                {onBack && (
                  <Pressable
                    onPress={onBack}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back', {
                      defaultValue: 'Back',
                    })}
                    className="absolute left-2 top-0 bottom-0 justify-center px-2"
                  >
                    <Icon name="chevron-back" size={20} color={accentPrimary} />
                  </Pressable>
                )}
              </View>
              {sections.map((section, sectionIndex) => (
                <React.Fragment key={section[0].key}>
                  {sectionIndex > 0 && (
                    <View
                      testID="action-sheet-group-spacer"
                      className="h-3 bg-background"
                    />
                  )}
                  <View
                    className={
                      layout === 'grid'
                        ? 'flex-row flex-wrap gap-3 px-4 pt-2 pb-4'
                        : undefined
                    }
                  >
                    {section.map((item) => (
                      <Pressable
                        key={item.key}
                        testID={`action-sheet-item-${item.key}`}
                        onPress={() => handleItemPress(item)}
                        className={
                          layout === 'grid'
                            ? 'flex-1 items-center rounded-2xl bg-raised p-5'
                            : 'px-4 py-3.5 border-b border-border-subtle'
                        }
                        style={({ pressed }) => ({
                          ...(layout === 'grid'
                            ? { flexBasis: '40%' }
                            : { borderBottomWidth: StyleSheet.hairlineWidth }),
                          opacity: pressed ? 0.65 : 1,
                        })}
                        accessibilityRole="button"
                        // Screen readers announce the description with the label, so
                        // the distinction is not sighted-only.
                        accessibilityLabel={
                          item.description
                            ? `${item.label}. ${item.description}`
                            : item.label
                        }
                      >
                        {item.icon && (
                          <View className="mb-3" accessible={false}>
                            <Icon
                              name={item.icon}
                              size={layout === 'grid' ? 44 : 28}
                              color={accentPrimary}
                            />
                          </View>
                        )}
                        <Text
                          className={`${layout === 'grid' ? 'text-sm text-center' : 'text-base'} font-medium ${
                            item.destructive
                              ? 'text-text-danger-subtle'
                              : 'text-text-primary'
                          }`}
                        >
                          {item.label}
                        </Text>
                        {item.description ? (
                          <Text className="text-sm text-text-muted mt-0.5">
                            {item.description}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                </React.Fragment>
              ))}
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

ActionSheet.displayName = 'ActionSheet';

export default ActionSheet;
