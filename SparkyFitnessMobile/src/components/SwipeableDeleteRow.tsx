import React, { useRef } from 'react';
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

const DELETE_ACTION_WIDTH = 80;

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
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const handleDeletePress = () => {
    Alert.alert(
      `Delete ${title}?`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => swipeableRef.current?.close() },
        {
          text: 'Delete',
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
      { text: 'Delete', style: 'destructive', onPress: onConfirmDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderRightActions = () => (
    <TouchableOpacity
      className="bg-bg-danger justify-center items-center"
      style={{ width: DELETE_ACTION_WIDTH }}
      onPress={handleDeletePress}
      activeOpacity={0.7}
    >
      <Text className="text-text-danger font-semibold text-sm">Delete</Text>
    </TouchableOpacity>
  );

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
