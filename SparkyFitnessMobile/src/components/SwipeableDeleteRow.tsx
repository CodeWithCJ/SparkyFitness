import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, Pressable, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

interface SwipeableDeleteRowProps {
  /** Names the row in the confirm dialog and long-press menu. */
  title: string;
  onConfirmDelete: () => void;
  /** Extra classes for the row body (padding, separators, layout). */
  className?: string;
  children: React.ReactNode;
}

export const DELETE_ACTION_WIDTH = 80;

/**
 * The red swipe-open "Delete" action shared by the swipeable row family.
 * Plain RN TouchableOpacity + className on purpose: NativeWind styles it
 * reliably (the red background) and it works inside ReanimatedSwipeable.
 */
export const DeleteRowAction: React.FC<{
  onPress: () => void;
  disabled?: boolean;
  className?: string;
  accessibilityLabel?: string;
}> = ({ onPress, disabled, className = '', accessibilityLabel }) => {
  const { t } = useTranslation();
  return (
  <TouchableOpacity
    className={`bg-bg-danger justify-center items-center ${className}`}
    style={{ width: DELETE_ACTION_WIDTH }}
    onPress={onPress}
    activeOpacity={0.7}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
  >
    <Text className="text-text-danger font-semibold text-sm">{t('common.delete', { defaultValue: 'Delete' })}</Text>
  </TouchableOpacity>
  );
};

/**
 * Generic swipe-to-delete wrapper for list rows whose only action is removal,
 * with a long-press menu as the discoverable fallback. Rows that also navigate
 * or edit keep their bespoke swipeable components (SwipeableFoodRow etc.).
 */
const SwipeableDeleteRow: React.FC<SwipeableDeleteRowProps> = ({
  title,
  onConfirmDelete,
  className = '',
  children,
}) => {
  const { t } = useTranslation();
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const handleDeletePress = () => {
    Alert.alert(
      t('common.deleteItemTitle', { defaultValue: 'Delete {{title}}?', title }),
      undefined,
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel', onPress: () => swipeableRef.current?.close() },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            swipeableRef.current?.close();
            onConfirmDelete();
          },
        },
      ],
      // Android lets the user dismiss by tapping outside; close the row so it
      // does not stay stuck in the swiped-open state.
      { cancelable: true, onDismiss: () => swipeableRef.current?.close() },
    );
  };

  // The menu itself is the confirmation, so Delete fires onConfirmDelete directly.
  const handleLongPress = () => {
    Alert.alert(title, undefined, [
      { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: onConfirmDelete },
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
    ]);
  };

  const renderRightActions = () => <DeleteRowAction onPress={handleDeletePress} />;

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
    >
      <Pressable onLongPress={handleLongPress} className={`bg-surface ${className}`}>
        {children}
      </Pressable>
    </ReanimatedSwipeable>
  );
};

export default SwipeableDeleteRow;
