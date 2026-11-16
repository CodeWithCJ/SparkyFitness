import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import FullScreenModalBody from './FullScreenModalBody';
import Icon from './Icon';

interface FocusPageProps {
  visible: boolean;
  /** The pill beside the close button, e.g. "Rest · Bench Press". */
  title: string;
  onClose: () => void;
  /** Pinned under the scroll, e.g. a Done button. */
  footer?: React.ReactNode;
  /** Wraps the body in a scroll view (default); off for a body that scrolls itself. */
  scroll?: boolean;
  children: React.ReactNode;
}

/**
 * The focus view's full-screen page (Phone-RestSets, SetOptions, Replace,
 * Plate, Rpe boards): a round close button and a title pill over a scrolling
 * body, with an optional pinned footer. A native `Modal`, so Android Back
 * closes it through `onRequestClose` and it sits above the workout screen's
 * own sheets.
 */
function FocusPage({
  visible,
  title,
  onClose,
  footer,
  scroll = true,
  children,
}: FocusPageProps) {
  const { t } = useTranslation();
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <FullScreenModalBody className="px-4">
        <View className="mb-4 flex-row items-center gap-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
            className="h-11 w-11 items-center justify-center rounded-full bg-raised active:opacity-70"
          >
            <Icon name="close" size={20} color={textPrimary} />
          </Pressable>
          <View className="min-w-0 flex-1 flex-row">
            <View className="max-w-full rounded-full bg-raised px-4 py-2.5">
              <Text
                numberOfLines={1}
                accessibilityRole="header"
                className="text-[17px] font-bold text-text-primary"
              >
                {title}
              </Text>
            </View>
          </View>
        </View>
        {scroll ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-3 pb-4"
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View className="flex-1">{children}</View>
        )}
        {footer != null && <View className="pt-3">{footer}</View>}
      </FullScreenModalBody>
    </Modal>
  );
}

export default React.memo(FocusPage);

interface FocusPageButtonProps {
  label: string;
  onPress: () => void;
  /** `primary` is the accent pill, `neutral` a raised one. */
  variant?: 'primary' | 'neutral' | 'danger';
  disabled?: boolean;
  testID?: string;
}

/** A full-width 56 pt pill for a focus page's footer (Done, Save, Skip...). */
export function FocusPageButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  testID,
}: FocusPageButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      className={`h-14 items-center justify-center rounded-full active:opacity-80 ${primary ? 'bg-accent-primary' : 'bg-raised'} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text
        className={`text-[18px] font-bold ${primary ? 'text-white' : variant === 'danger' ? 'text-icon-danger' : 'text-text-primary'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
