import React, { useRef } from 'react';
import { Alert, View, Text, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

interface SwipeableIngredientRowProps {
  foodName: string;
  quantityLabel: string;
  caloriesLabel: string;
  showBottomBorder: boolean;
  isLastIngredient: boolean;
  disabled?: boolean;
  onConfirmDelete: () => void;
  // Optional tap handler for editing the ingredient. When provided, the row
  // body becomes a button; swipe-to-delete still works alongside it.
  onPress?: () => void;
}

const DELETE_ACTION_WIDTH = 80;

const SwipeableIngredientRow: React.FC<SwipeableIngredientRowProps> = ({
  foodName,
  quantityLabel,
  caloriesLabel,
  showBottomBorder,
  isLastIngredient,
  disabled = false,
  onConfirmDelete,
  onPress,
}) => {
  // Matches the existing `SwipeableFoodRow` convention in this codebase. A more
  // specific ref type (e.g. `React.ComponentRef<typeof ReanimatedSwipeable>`)
  // resolves to `{}` and breaks `.close()` under the current Expo SDK 55 React
  // types; until upstream tightens this, `any` is what the rest of the project
  // uses for the same ref.
  const swipeableRef = useRef<any>(null);

  const handleDeletePress = () => {
    const message = isLastIngredient
      ? 'This is the last ingredient. Add another before you can save, or use Delete Meal to remove the whole meal.'
      : undefined;
    Alert.alert(
      `Remove ${foodName}?`,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => swipeableRef.current?.close() },
        {
          text: 'Remove',
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

  // Long-press menu: a discoverable path for users who don't think to swipe
  // (per contributor feedback on #1473), matching MealAddScreen's row menu. The
  // menu itself is the confirmation, so Delete fires onConfirmDelete directly;
  // the last-ingredient warning is surfaced in the message instead.
  const handleLongPress = () => {
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive';
      onPress?: () => void;
    }[] = [];
    if (onPress) buttons.push({ text: 'Edit', onPress });
    buttons.push({ text: 'Delete', style: 'destructive', onPress: onConfirmDelete });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    const message = isLastIngredient
      ? 'This is the last ingredient. Add another before you can save, or use Delete Meal to remove the whole meal.'
      : undefined;
    Alert.alert(foodName, message, buttons);
  };

  // RN TouchableOpacity + className here, matching SwipeableFoodRow /
  // SwipeableExerciseRow: NativeWind styles it reliably (the red background) and
  // it works inside ReanimatedSwipeable, as those shipped rows demonstrate.
  const renderRightActions = () => (
    <TouchableOpacity
      className="bg-bg-danger justify-center items-center"
      style={{ width: DELETE_ACTION_WIDTH }}
      onPress={handleDeletePress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <Text className="text-text-danger font-semibold text-sm">Delete</Text>
    </TouchableOpacity>
  );

  const rowBody = (
    <View
      className={`flex-row items-center px-3 py-2 bg-surface ${showBottomBorder ? 'border-b border-border-subtle' : ''}`}
    >
      <View className="flex-1 mr-2">
        <Text className="text-text-primary text-base" numberOfLines={1}>
          {foodName}
        </Text>
        <Text className="text-text-secondary text-xs mt-0.5">{quantityLabel}</Text>
      </View>
      <Text className="text-text-secondary text-sm font-medium">{caloriesLabel}</Text>
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
      enabled={!disabled}
    >
      {onPress ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onPress}
          onLongPress={handleLongPress}
          disabled={disabled}
          accessibilityLabel={`Edit ${foodName}`}
          accessibilityRole="button"
        >
          {rowBody}
        </TouchableOpacity>
      ) : (
        rowBody
      )}
    </ReanimatedSwipeable>
  );
};

export default SwipeableIngredientRow;
